import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnitsService, DEFAULT_PRESET_UNITS } from './units.service.js';
import { UserRole } from '@prisma/client';
import { ForbiddenException, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';

describe('UnitsService', () => {
  let unitsService: UnitsService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      $transaction: vi.fn().mockImplementation((cb) => cb(mockPrisma)),
      systemSetting: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
      auditEvent: {
        create: vi.fn(),
      },
      productUnit: {
        groupBy: vi.fn().mockResolvedValue([
          { unitName: 'Vial', _count: { productId: 5 } },
          { unitName: 'Box of 10', _count: { productId: 2 } },
        ]),
      },
    };

    unitsService = new UnitsService(mockPrisma as any);
  });

  describe('findAll', () => {
    it('returns default preset units with product usage count when settings are empty', async () => {
      mockPrisma.systemSetting.findUnique.mockResolvedValue(null);

      const units = await unitsService.findAll();
      expect(units.length).toBe(DEFAULT_PRESET_UNITS.length);

      const vial = units.find((u) => u.name === 'Vial');
      expect(vial).toBeDefined();
      expect(vial?.isPreset).toBe(true);
      expect(vial?.productCount).toBe(5);

      const tube = units.find((u) => u.name === 'Tube');
      expect(tube).toBeDefined();
      expect(tube?.productCount).toBe(0);
    });

    it('merges custom units and respects hidden presets', async () => {
      mockPrisma.systemSetting.findUnique.mockResolvedValue({
        key: 'catalog_standard_units',
        valueJson: {
          customUnits: [
            { name: 'Custom Pack 25', category: 'PACKAGING', description: 'Special 25 pack', isPreset: false },
          ],
          hiddenPresets: ['Ampoule'],
        },
      });

      const units = await unitsService.findAll();
      expect(units.some((u) => u.name === 'Ampoule')).toBe(false);
      expect(units.some((u) => u.name === 'Custom Pack 25')).toBe(true);
      expect(units.find((u) => u.name === 'Custom Pack 25')?.category).toBe('PACKAGING');
    });
  });

  describe('create', () => {
    it('blocks non-Super Admin from adding units', async () => {
      const storeAdmin: any = { id: 'sa-1', role: UserRole.STORE_ADMIN };
      await expect(
        unitsService.create({ name: 'Cartridge 5ml' }, storeAdmin),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects empty or whitespace unit name', async () => {
      const superAdmin: any = { id: 'su-1', role: UserRole.SUPER_ADMIN };
      await expect(
        unitsService.create({ name: '   ' }, superAdmin),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate unit name', async () => {
      const superAdmin: any = { id: 'su-1', role: UserRole.SUPER_ADMIN };
      mockPrisma.systemSetting.findUnique.mockResolvedValue(null);

      await expect(
        unitsService.create({ name: 'vial' }, superAdmin),
      ).rejects.toThrow(ConflictException);
    });

    it('creates custom unit and writes audit log for Super Admin', async () => {
      const superAdmin: any = { id: 'su-1', role: UserRole.SUPER_ADMIN };
      mockPrisma.systemSetting.findUnique.mockResolvedValue(null);

      const result = await unitsService.create(
        { name: 'Cartridge 5ml', category: 'CONTAINER', description: 'Special cartridge' },
        superAdmin,
      );

      expect(result.name).toBe('Cartridge 5ml');
      expect(result.category).toBe('CONTAINER');
      expect(result.isPreset).toBe(false);

      expect(mockPrisma.systemSetting.upsert).toHaveBeenCalledTimes(1);
      expect(mockPrisma.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'STANDARD_UNIT_CREATED',
            entityType: 'CATALOG_UNIT',
            entityId: 'Cartridge 5ml',
          }),
        }),
      );
    });
  });

  describe('delete', () => {
    it('blocks non-Super Admin from deleting units', async () => {
      const clientAdmin: any = { id: 'ca-1', role: UserRole.CLIENT_ADMIN };
      await expect(
        unitsService.delete('Vial', clientAdmin),
      ).rejects.toThrow(ForbiddenException);
    });

    it('hides preset unit when deleted by Super Admin', async () => {
      const superAdmin: any = { id: 'su-1', role: UserRole.SUPER_ADMIN };
      mockPrisma.systemSetting.findUnique.mockResolvedValue(null);

      const res = await unitsService.delete('Vial', superAdmin);
      expect(res.success).toBe(true);

      expect(mockPrisma.systemSetting.upsert).toHaveBeenCalledTimes(1);
      expect(mockPrisma.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'STANDARD_UNIT_DELETED',
            entityId: 'Vial',
          }),
        }),
      );
    });

    it('throws NotFoundException if unit does not exist', async () => {
      const superAdmin: any = { id: 'su-1', role: UserRole.SUPER_ADMIN };
      mockPrisma.systemSetting.findUnique.mockResolvedValue(null);

      await expect(
        unitsService.delete('NonExistentUnit123', superAdmin),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
