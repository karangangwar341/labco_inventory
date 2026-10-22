import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BackupsService } from './backups.service.js';
import {
  BackupStatus,
  DrillStatus,
  NotificationEventType,
  UserRole,
} from '@prisma/client';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('BackupsService', () => {
  let service: BackupsService;
  let mockPrisma: any;
  let mockNotificationsService: any;

  const mockSuperAdmin = {
    id: 'user-sa-1',
    role: UserRole.SUPER_ADMIN,
    username: 'superadmin',
    status: 'ACTIVE',
  };

  beforeEach(() => {
    mockPrisma = {
      backupRecord: {
        create: vi.fn(),
        update: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
      },
      systemSetting: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
      auditEvent: {
        create: vi.fn(),
      },
      user: {
        findMany: vi.fn(),
      },
      inventoryBalance: {
        findMany: vi.fn(),
      },
      stockRequest: {
        count: vi.fn(),
      },
      stockAlertState: {
        count: vi.fn(),
      },
      $queryRaw: vi.fn(),
    };

    mockNotificationsService = {
      createNotification: vi.fn(),
    };

    service = new BackupsService(mockPrisma as any, mockNotificationsService as any);
  });

  describe('triggerBackup (REQ-019 & Test Plan Item 18)', () => {
    it('creates a completed backup record with 90-day retention and clears persistent warning on success', async () => {
      const createdRecord = {
        id: 'backup-123',
        status: BackupStatus.STARTED,
        retentionUntil: new Date(),
        retryCount: 0,
      };

      const updatedCompletedRecord = {
        ...createdRecord,
        status: BackupStatus.COMPLETED,
        completedAt: new Date(),
        storageReference: 'backups/db-backup-123-1000.sql.gz',
        checksum: 'a'.repeat(64),
        sizeBytes: 15485760,
      };

      mockPrisma.backupRecord.create.mockResolvedValue(createdRecord);
      mockPrisma.backupRecord.update.mockResolvedValue(updatedCompletedRecord);
      mockPrisma.systemSetting.upsert.mockResolvedValue({});
      mockPrisma.auditEvent.create.mockResolvedValue({});

      const result = await service.triggerBackup({ retentionDays: 90 }, {
        id: 'user-sa-1',
        role: UserRole.SUPER_ADMIN,
        username: 'superadmin',
        status: 'ACTIVE',
        sessionId: 'sess-sa-1',
      });

      expect(mockPrisma.backupRecord.create).toHaveBeenCalled();
      expect(mockPrisma.backupRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'backup-123' },
          data: expect.objectContaining({
            status: BackupStatus.COMPLETED,
            checksum: expect.any(String),
          }),
        }),
      );

      // Verify persistent warning cleared in system_settings
      expect(mockPrisma.systemSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'backup_persistent_warning' },
          update: expect.objectContaining({
            valueJson: expect.objectContaining({ activeWarning: false }),
          }),
        }),
      );

      // Verify audit event logged
      expect(mockPrisma.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'BACKUP_COMPLETED',
            entityType: 'BackupRecord',
            entityId: 'backup-123',
          }),
        }),
      );

      expect(result.status).toBe(BackupStatus.COMPLETED);
    });

    it('retries up to 3 times on failure, alerts Super Admin, logs audit event, and sets persistent warning (Item 18)', async () => {
      const createdRecord = {
        id: 'backup-fail-1',
        status: BackupStatus.STARTED,
        retentionUntil: new Date(),
        retryCount: 0,
      };

      const failedRecord = {
        ...createdRecord,
        status: BackupStatus.FAILED,
        completedAt: new Date(),
        retryCount: 3,
        errorSummary:
          'Backup execution failed after 3 automated retry attempts: Storage target unreachable / write verification failure',
      };

      mockPrisma.backupRecord.create.mockResolvedValue(createdRecord);
      mockPrisma.backupRecord.update.mockResolvedValue(failedRecord);
      mockPrisma.systemSetting.upsert.mockResolvedValue({});
      mockPrisma.user.findMany.mockResolvedValue([mockSuperAdmin]);
      mockNotificationsService.createNotification.mockResolvedValue({});
      mockPrisma.auditEvent.create.mockResolvedValue({});

      const result = await service.triggerBackup(
        { simulateFailure: true, retentionDays: 90 },
        { id: 'user-sa-1', role: UserRole.SUPER_ADMIN, username: 'superadmin', status: 'ACTIVE', sessionId: 'sess-sa-1' },
      );

      expect(mockPrisma.backupRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'backup-fail-1' },
          data: expect.objectContaining({
            status: BackupStatus.FAILED,
            retryCount: 3,
          }),
        }),
      );

      // Verify persistent warning active in system_settings
      expect(mockPrisma.systemSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'backup_persistent_warning' },
          update: expect.objectContaining({
            valueJson: expect.objectContaining({ activeWarning: true }),
          }),
        }),
      );

      // Verify Super Admin alert
      expect(mockNotificationsService.createNotification).toHaveBeenCalledWith(
        'user-sa-1',
        NotificationEventType.BACKUP_FAILED,
        expect.stringContaining('CRITICAL'),
        expect.stringContaining('failed after 3 retry attempts'),
        'BackupRecord',
        'backup-fail-1',
      );

      // Verify audit event
      expect(mockPrisma.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'BACKUP_FAILED',
            entityType: 'BackupRecord',
            entityId: 'backup-fail-1',
          }),
        }),
      );

      expect(result.status).toBe(BackupStatus.FAILED);
      expect(result.retryCount).toBe(3);
    });
  });

  describe('runRestoreDrill (REQ-023 & Test Plan Item 68)', () => {
    it('successfully validates completed backup checksum and inventory invariants in isolated drill sandbox', async () => {
      const backup = {
        id: 'backup-good',
        status: BackupStatus.COMPLETED,
        checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      };

      const validBalances = [
        {
          id: 'balance-1',
          physicalQty: 100,
          usableQty: 80,
          damagedQty: 15,
          expiredQty: 5,
          reservedQty: 20, // Available = 80 - 20 = 60 >= 0
        },
      ];

      mockPrisma.backupRecord.findUnique.mockResolvedValue(backup);
      mockPrisma.inventoryBalance.findMany.mockResolvedValue(validBalances);
      mockPrisma.backupRecord.update.mockResolvedValue({
        ...backup,
        drillStatus: DrillStatus.SUCCESSFUL,
        drillAt: new Date(),
        drillNotes: 'Drill passed',
      });
      mockPrisma.user.findMany.mockResolvedValue([mockSuperAdmin]);
      mockNotificationsService.createNotification.mockResolvedValue({});
      mockPrisma.auditEvent.create.mockResolvedValue({});

      const result = await service.runRestoreDrill('backup-good', {
        targetEnvironment: 'isolated-drill-sandbox',
        verifyLedgerConsistency: true,
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.backupRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'backup-good' },
          data: expect.objectContaining({
            drillStatus: DrillStatus.SUCCESSFUL,
          }),
        }),
      );

      expect(mockNotificationsService.createNotification).toHaveBeenCalledWith(
        'user-sa-1',
        NotificationEventType.RESTORE_DRILL_PASSED,
        expect.stringContaining('Restore Drill Passed'),
        expect.any(String),
        'BackupRecord',
        'backup-good',
      );
    });

    it('rejects restore drill if backup status is not COMPLETED', async () => {
      mockPrisma.backupRecord.findUnique.mockResolvedValue({
        id: 'backup-started',
        status: BackupStatus.STARTED,
      });

      await expect(
        service.runRestoreDrill('backup-started', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('fails restore drill and alerts Super Admin if checksum is missing or corrupted', async () => {
      const corruptBackup = {
        id: 'backup-bad-chk',
        status: BackupStatus.COMPLETED,
        checksum: 'short', // Invalid SHA-256
      };

      mockPrisma.backupRecord.findUnique.mockResolvedValue(corruptBackup);
      mockPrisma.backupRecord.update.mockResolvedValue({});
      mockPrisma.user.findMany.mockResolvedValue([mockSuperAdmin]);
      mockNotificationsService.createNotification.mockResolvedValue({});
      mockPrisma.auditEvent.create.mockResolvedValue({});

      await expect(
        service.runRestoreDrill('backup-bad-chk', {}),
      ).rejects.toThrow('Corrupted or missing SHA-256 archive checksum');

      expect(mockPrisma.backupRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'backup-bad-chk' },
          data: expect.objectContaining({
            drillStatus: DrillStatus.FAILED,
          }),
        }),
      );

      expect(mockNotificationsService.createNotification).toHaveBeenCalledWith(
        'user-sa-1',
        NotificationEventType.RESTORE_DRILL_FAILED,
        expect.stringContaining('ALERT: Restore Drill Verification Failed'),
        expect.any(String),
        'BackupRecord',
        'backup-bad-chk',
      );
    });

    it('fails restore drill if non-negative bucket invariant is violated (e.g. negative usable or damaged)', async () => {
      const backup = {
        id: 'backup-inv-fail',
        status: BackupStatus.COMPLETED,
        checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      };

      const corruptedBalances = [
        {
          id: 'balance-corrupt',
          usableQty: -10, // Negative bucket violates invariant!
          damagedQty: 10,
          expiredQty: 10,
          reservedQty: 0,
        },
      ];

      mockPrisma.backupRecord.findUnique.mockResolvedValue(backup);
      mockPrisma.inventoryBalance.findMany.mockResolvedValue(corruptedBalances);
      mockPrisma.backupRecord.update.mockResolvedValue({});
      mockPrisma.user.findMany.mockResolvedValue([mockSuperAdmin]);
      mockNotificationsService.createNotification.mockResolvedValue({});
      mockPrisma.auditEvent.create.mockResolvedValue({});

      await expect(
        service.runRestoreDrill('backup-inv-fail', { verifyLedgerConsistency: true }),
      ).rejects.toThrow('Negative inventory bucket detected');

      expect(mockPrisma.backupRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'backup-inv-fail' },
          data: expect.objectContaining({
            drillStatus: DrillStatus.FAILED,
          }),
        }),
      );

      expect(mockNotificationsService.createNotification).toHaveBeenCalledWith(
        'user-sa-1',
        NotificationEventType.RESTORE_DRILL_FAILED,
        expect.stringContaining('ALERT: Restore Drill Verification Failed'),
        expect.stringContaining('Negative inventory bucket detected'),
        'BackupRecord',
        'backup-inv-fail',
      );
    });

    it('fails restore drill if Available < 0 invariant is violated (negative usable stock)', async () => {
      const backup = {
        id: 'backup-neg-avail',
        status: BackupStatus.COMPLETED,
        checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      };

      const corruptedBalances = [
        {
          id: 'balance-neg',
          physicalQty: 10,
          usableQty: 10,
          damagedQty: 0,
          expiredQty: 0,
          reservedQty: 15, // Available = 10 - 15 = -5 < 0 !
        },
      ];

      mockPrisma.backupRecord.findUnique.mockResolvedValue(backup);
      mockPrisma.inventoryBalance.findMany.mockResolvedValue(corruptedBalances);
      mockPrisma.backupRecord.update.mockResolvedValue({});
      mockPrisma.user.findMany.mockResolvedValue([mockSuperAdmin]);
      mockNotificationsService.createNotification.mockResolvedValue({});
      mockPrisma.auditEvent.create.mockResolvedValue({});

      await expect(
        service.runRestoreDrill('backup-neg-avail', { verifyLedgerConsistency: true }),
      ).rejects.toThrow('Negative available stock detected');
    });
  });

  describe('getHealth and monitoring', () => {
    it('returns HEALTHY status when database is connected and no backup persistent warning exists', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ 1: 1 }]);
      mockPrisma.backupRecord.findFirst.mockResolvedValue({
        id: 'bk-last',
        status: BackupStatus.COMPLETED,
        completedAt: new Date(),
      });
      mockPrisma.backupRecord.count.mockResolvedValue(10);
      mockPrisma.systemSetting.findUnique.mockResolvedValue({
        key: 'backup_persistent_warning',
        valueJson: { activeWarning: false },
      });
      mockPrisma.stockRequest.count.mockResolvedValue(2);
      mockPrisma.stockAlertState.count.mockResolvedValue(0);

      const health = await service.getHealth();

      expect(health.status).toBe('HEALTHY');
      expect(health.database).toBe('CONNECTED');
      expect(health.backups.healthy).toBe(true);
      expect(health.backups.hasPersistentWarning).toBe(false);
      expect(health.monitoring.pendingApprovalsCount).toBe(2);
    });

    it('returns DEGRADED status when a persistent backup warning is active', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ 1: 1 }]);
      mockPrisma.backupRecord.findFirst.mockResolvedValue(null);
      mockPrisma.backupRecord.count.mockResolvedValue(1);
      mockPrisma.systemSetting.findUnique.mockResolvedValue({
        key: 'backup_persistent_warning',
        valueJson: { activeWarning: true, errorSummary: 'Storage down' },
      });
      mockPrisma.stockRequest.count.mockResolvedValue(0);
      mockPrisma.stockAlertState.count.mockResolvedValue(0);

      const health = await service.getHealth();

      expect(health.status).toBe('DEGRADED');
      expect(health.backups.healthy).toBe(false);
      expect(health.backups.hasPersistentWarning).toBe(true);
    });
  });
});
