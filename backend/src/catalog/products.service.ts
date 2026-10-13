import {
  Injectable,
  ForbiddenException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { ApproveProductDto, ApprovalDecision } from './dto/approve-product.dto.js';
import { UserRole, CatalogScope, ProductStatus, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

export function computeDuplicateKey(params: {
  ownerScope: CatalogScope;
  clientId?: string | null;
  name: string;
  categoryId: string;
  brand?: string | null;
  attributes?: { attributeName: string; value: string }[];
}): string {
  const scopePart =
    params.ownerScope === CatalogScope.CLIENT
      ? `client:${params.clientId}`
      : 'company';
  const namePart = params.name.trim().toLowerCase();
  const categoryPart = params.categoryId;
  const brandPart = (params.brand || '').trim().toLowerCase();

  const attrsPart = (params.attributes || [])
    .map(
      (a) =>
        `${a.attributeName.trim().toLowerCase()}=${a.value.trim().toLowerCase()}`,
    )
    .sort()
    .join(';');

  return `${scopePart}::${categoryPart}::${namePart}::${brandPart}::${attrsPart}`;
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProductDto, user: AuthenticatedUser) {
    if (user.role === UserRole.STORE_ADMIN) {
      throw new ForbiddenException('Store Admin cannot create or edit products');
    }

    // Precision & Fractional validation (REQ-011)
    if (!dto.allowFractional && dto.quantityPrecision !== 0) {
      throw new BadRequestException(
        'Whole-unit products must have a quantityPrecision of 0',
      );
    }

    // Units validation (REQ-010)
    if (!dto.units || dto.units.length === 0) {
      throw new BadRequestException('At least one unit of measure is required');
    }

    const baseUnits = dto.units.filter((u) => u.isBaseUnit);
    if (baseUnits.length !== 1) {
      throw new BadRequestException(
        'Exactly one unit must be designated as the base unit (isBaseUnit: true)',
      );
    }

    if (Number(baseUnits[0].conversionToBase) !== 1) {
      throw new BadRequestException(
        'The base unit must have a conversionToBase ratio of exactly 1',
      );
    }

    for (const u of dto.units) {
      if (u.conversionToBase <= 0) {
        throw new BadRequestException(
          `Unit "${u.unitName}" conversionToBase must be strictly positive`,
        );
      }
    }

    // Verify category exists
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    let ownerScope: CatalogScope = CatalogScope.COMPANY;
    let clientId: string | null = null;
    let initialStatus: ProductStatus = ProductStatus.APPROVED; // Super Admin company products are immediately approved

    if (user.role === UserRole.CLIENT_ADMIN) {
      ownerScope = CatalogScope.CLIENT;
      initialStatus = ProductStatus.PENDING_APPROVAL; // Client products require Super Admin approval

      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { clientId: true },
      });
      if (!dbUser?.clientId) {
        throw new ForbiddenException('Client Admin must belong to an organization');
      }
      clientId = dbUser.clientId;
    }

    // Compute deterministic duplicate key (D-003)
    const duplicateKey = computeDuplicateKey({
      ownerScope,
      clientId,
      name: dto.name,
      categoryId: dto.categoryId,
      brand: dto.brand,
      attributes: dto.attributes,
    });

    const existingDuplicate = await this.prisma.product.findUnique({
      where: { duplicateKey },
    });

    if (existingDuplicate) {
      throw new ConflictException(
        `A product with identical name, brand, category, and specifications already exists in this catalog scope`,
      );
    }

    const normalizedName = dto.name.trim();

    return this.prisma.product.create({
      data: {
        name: normalizedName,
        brand: dto.brand?.trim() || null,
        description: dto.description?.trim() || null,
        categoryId: dto.categoryId,
        ownerScope,
        clientId,
        status: initialStatus,
        quantityPrecision: dto.quantityPrecision,
        allowFractional: dto.allowFractional,
        trackingMode: dto.trackingMode,
        minQuantity: new Prisma.Decimal(dto.minQuantity || 0),
        duplicateKey,
        attributes: {
          create: (dto.attributes || []).map((attr, idx) => ({
            attributeName: attr.attributeName.trim(),
            value: attr.value.trim(),
            unit: attr.unit?.trim() || null,
            sortOrder: attr.sortOrder ?? idx,
          })),
        },
        units: {
          create: dto.units.map((u) => ({
            unitName: u.unitName.trim(),
            isBaseUnit: u.isBaseUnit,
            conversionToBase: new Prisma.Decimal(u.conversionToBase),
          })),
        },
      },
      include: {
        category: true,
        attributes: true,
        units: true,
      },
    });
  }

  async findAll(
    user: AuthenticatedUser,
    filters?: { status?: ProductStatus; categoryId?: string; search?: string },
  ) {
    const where: Prisma.ProductWhereInput = {};

    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.categoryId) {
      where.categoryId = filters.categoryId;
    }
    if (filters?.search) {
      where.name = { contains: filters.search, mode: 'insensitive' };
    }

    if (user.role === UserRole.SUPER_ADMIN) {
      // Super Admin sees all
      return this.prisma.product.findMany({
        where,
        include: {
          category: true,
          attributes: true,
          units: true,
          client: { select: { id: true, name: true } },
        },
        orderBy: { name: 'asc' },
      });
    }

    if (user.role === UserRole.STORE_ADMIN) {
      // Store Admin views approved company products
      where.ownerScope = CatalogScope.COMPANY;
      where.status = ProductStatus.APPROVED;

      return this.prisma.product.findMany({
        where,
        include: {
          category: true,
          attributes: true,
          units: true,
        },
        orderBy: { name: 'asc' },
      });
    }

    if (user.role === UserRole.CLIENT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { clientId: true },
      });
      const clientOrgId = dbUser?.clientId || '';

      // Client Admin sees approved company products OR products for their client
      return this.prisma.product.findMany({
        where: {
          AND: [
            where,
            {
              OR: [
                { ownerScope: CatalogScope.COMPANY, status: ProductStatus.APPROVED },
                { ownerScope: CatalogScope.CLIENT, clientId: clientOrgId },
              ],
            },
          ],
        },
        include: {
          category: true,
          attributes: true,
          units: true,
        },
        orderBy: { name: 'asc' },
      });
    }

    return [];
  }

  async findById(id: string, user: AuthenticatedUser) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        attributes: true,
        units: true,
        client: { select: { id: true, name: true } },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (user.role === UserRole.CLIENT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { clientId: true },
      });
      if (
        product.ownerScope === CatalogScope.CLIENT &&
        product.clientId !== dbUser?.clientId
      ) {
        throw new ForbiddenException('Access denied to other client products');
      }
    }

    return product;
  }

  async reviewProduct(id: string, dto: ApproveProductDto, approver: AuthenticatedUser) {
    if (approver.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can approve or reject products');
    }

    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.status !== ProductStatus.PENDING_APPROVAL) {
      throw new ConflictException(
        `Product is not in PENDING_APPROVAL state (current state: ${product.status})`,
      );
    }

    if (dto.decision === ApprovalDecision.REJECT && !dto.reason) {
      throw new BadRequestException('Rejection reason is required when rejecting a product');
    }

    const now = new Date();
    return this.prisma.product.update({
      where: { id },
      data: {
        status:
          dto.decision === ApprovalDecision.APPROVE
            ? ProductStatus.APPROVED
            : ProductStatus.REJECTED,
        approvedById: dto.decision === ApprovalDecision.APPROVE ? approver.id : null,
        approvedAt: dto.decision === ApprovalDecision.APPROVE ? now : null,
        rejectionReason:
          dto.decision === ApprovalDecision.REJECT ? dto.reason?.trim() : null,
      },
      include: {
        category: true,
        attributes: true,
        units: true,
      },
    });
  }
}
