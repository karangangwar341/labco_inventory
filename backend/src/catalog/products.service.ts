import {
  Injectable,
  ForbiddenException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CreateProductDto, ProposeProductVersionDto } from './dto/create-product.dto.js';
import { ApproveProductDto, ApprovalDecision } from './dto/approve-product.dto.js';
import { UserRole, CatalogScope, ProductKind, ProductStatus, ProductVersionStatus, UnitStatus, Prisma } from '@prisma/client';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private productsCache = new Map<string, { data: any[]; expiresAt: number }>();

  public invalidateCache() {
    this.productsCache.clear();
  }

  private specificationSnapshot(dto: CreateProductDto): Prisma.InputJsonObject {
    return {
      name: dto.name.trim(),
      kind: dto.kind,
      brand: dto.brand?.trim() || null,
      description: dto.description?.trim() || null,
      categoryId: dto.categoryId,
      quantityPrecision: dto.quantityPrecision,
      allowFractional: dto.allowFractional,
      trackingMode: dto.trackingMode,
      minQuantity: String(dto.minQuantity || 0),
      minOrderQuantity: String(dto.minOrderQuantity || 1),
      attributes: (dto.attributes || []).map((attribute, index) => ({
        attributeName: attribute.attributeName.trim(),
        value: attribute.value.trim(),
        unit: attribute.unit?.trim() || null,
        sortOrder: attribute.sortOrder ?? index,
      })),
      units: dto.units.map((unit) => ({
        unitName: unit.unitName.trim(),
        isBaseUnit: unit.isBaseUnit,
        conversionToBase: String(unit.conversionToBase),
      })),
    };
  }

  private validateUnits(dto: CreateProductDto) {
    if (!dto.allowFractional && dto.quantityPrecision !== 0) {
      throw new BadRequestException('Whole-unit products must have a quantity precision of 0');
    }
    if (!dto.units?.length) {
      throw new BadRequestException('Add at least one unit');
    }
    const baseUnits = dto.units.filter((unit) => unit.isBaseUnit);
    if (baseUnits.length !== 1 || Number(baseUnits[0].conversionToBase) !== 1) {
      throw new BadRequestException('Choose exactly one base unit with a 1:1 conversion');
    }
    for (const unit of dto.units) {
      if (!Number.isFinite(Number(unit.conversionToBase)) || Number(unit.conversionToBase) <= 0) {
        throw new BadRequestException(`Unit "${unit.unitName}" must have a positive conversion`);
      }
    }
  }

  async create(dto: CreateProductDto, user: AuthenticatedUser) {
    if (user.role === UserRole.STORE_ADMIN) {
      throw new ForbiddenException('Store Admin cannot create or edit products');
    }
    if (user.role === UserRole.CLIENT_ADMIN && dto.kind !== 'MANUFACTURED_PRODUCT') {
      throw new BadRequestException('Client Admins can create manufactured products only');
    }

    this.validateUnits(dto);

    // Verify category exists
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
      include: { parent: true },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    let ownerScope: CatalogScope = CatalogScope.COMPANY;
    let clientId: string | null = null;
    let initialStatus: ProductStatus = ProductStatus.APPROVED; // Super Admin company products are immediately approved

    if (user.role === UserRole.SUPER_ADMIN) {
      if (dto.kind === 'MANUFACTURED_PRODUCT' || dto.clientId) {
        ownerScope = CatalogScope.CLIENT;
        if (dto.clientId) {
          clientId = dto.clientId;
        } else {
          const firstClient = await this.prisma.client.findFirst({
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'asc' },
          });
          clientId = firstClient?.id || null;
        }
      }
    } else if (user.role === UserRole.CLIENT_ADMIN) {
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

    const rootScope = category.parent ? category.parent.ownerScope : category.ownerScope;
    const rootClientId = category.parent ? category.parent.clientId : category.clientId;
    if (
      (ownerScope === CatalogScope.COMPANY && (category.ownerScope !== CatalogScope.COMPANY || rootScope !== CatalogScope.COMPANY)) ||
      (ownerScope === CatalogScope.CLIENT && (category.ownerScope !== CatalogScope.CLIENT || (clientId && category.clientId !== clientId) || (clientId && rootClientId !== clientId)))
    ) {
      throw new ForbiddenException('Choose a category available in your catalog');
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

    const created = await this.prisma.product.create({
      data: {
        name: normalizedName,
        brand: dto.brand?.trim() || null,
        description: dto.description?.trim() || null,
        categoryId: dto.categoryId,
        kind: dto.kind,
        ownerScope,
        clientId,
        status: initialStatus,
        quantityPrecision: dto.quantityPrecision,
        allowFractional: dto.allowFractional,
        trackingMode: dto.trackingMode,
        minQuantity: new Prisma.Decimal(dto.minQuantity || 0),
        minOrderQuantity: new Prisma.Decimal(dto.minOrderQuantity || 1),
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
        versions: {
          create: {
            versionNumber: 1,
            status: initialStatus === ProductStatus.APPROVED
              ? ProductVersionStatus.APPROVED
              : ProductVersionStatus.PENDING_APPROVAL,
            specification: this.specificationSnapshot(dto),
            submittedById: user.id,
            reviewedById: initialStatus === ProductStatus.APPROVED ? user.id : null,
            reviewedAt: initialStatus === ProductStatus.APPROVED ? new Date() : null,
            effectiveFrom: initialStatus === ProductStatus.APPROVED ? new Date() : null,
          },
        },
      },
      include: {
        category: true,
        attributes: true,
        units: true,
      },
    });
    if (user.role === UserRole.CLIENT_ADMIN) {
      await this.notificationsService.notifySuperAdmins(
        'Product awaiting approval',
        `A client submitted “${created.name}” for catalog approval.`,
        'PRODUCT',
        created.id,
      );
    }
    this.invalidateCache();
    return created;
  }

  async proposeVersion(id: string, dto: ProposeProductVersionDto, user: AuthenticatedUser) {
    if (user.role === UserRole.STORE_ADMIN) {
      throw new ForbiddenException('Store Admin cannot edit products');
    }
    this.validateUnits(dto);

    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { attributes: true, units: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product.status !== ProductStatus.APPROVED) {
      throw new ConflictException('Only an approved product can be edited');
    }
    if (dto.kind !== product.kind) {
      throw new BadRequestException('Product type cannot be changed after creation. Create a separate product for the other type.');
    }

    if (user.role === UserRole.CLIENT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { clientId: true },
      });
      if (product.ownerScope !== CatalogScope.CLIENT || product.clientId !== dbUser?.clientId) {
        throw new ForbiddenException('You can only edit products in your client catalog');
      }
    }

    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
      include: { parent: true },
    });
    if (!category) throw new NotFoundException('Category not found');
    const rootScope = category.parent ? category.parent.ownerScope : category.ownerScope;
    const rootClientId = category.parent ? category.parent.clientId : category.clientId;
    if (
      (product.ownerScope === CatalogScope.COMPANY && (category.ownerScope !== CatalogScope.COMPANY || rootScope !== CatalogScope.COMPANY)) ||
      (product.ownerScope === CatalogScope.CLIENT && category.id !== product.categoryId &&
        (category.ownerScope !== CatalogScope.CLIENT || category.clientId !== product.clientId || rootClientId !== product.clientId))
    ) {
      throw new ForbiddenException('Choose a category available in this catalog');
    }

    const duplicateKey = computeDuplicateKey({
      ownerScope: product.ownerScope,
      clientId: product.clientId,
      name: dto.name,
      categoryId: dto.categoryId,
      brand: dto.brand,
      attributes: dto.attributes,
    });
    const duplicate = await this.prisma.product.findUnique({ where: { duplicateKey } });
    if (duplicate && duplicate.id !== id) {
      throw new ConflictException('An identical product already exists in this catalog');
    }

    const pendingVersion = await this.prisma.productVersion.findFirst({
      where: { productId: id, status: ProductVersionStatus.PENDING_APPROVAL },
      select: { id: true },
    });
    if (pendingVersion) {
      throw new ConflictException('This product already has a change awaiting approval');
    }

    let latestVersion = await this.prisma.productVersion.findFirst({
      where: { productId: id },
      orderBy: { versionNumber: 'desc' },
    });
    if (!latestVersion) {
      const currentSnapshot = {
        name: product.name,
        kind: product.kind,
        brand: product.brand,
        description: product.description,
        categoryId: product.categoryId,
        quantityPrecision: product.quantityPrecision,
        allowFractional: product.allowFractional,
        trackingMode: product.trackingMode,
        minQuantity: product.minQuantity.toString(),
        minOrderQuantity: (product.minOrderQuantity || 1).toString(),
        attributes: product.attributes.map(({ attributeName, value, unit, sortOrder }) => ({ attributeName, value, unit, sortOrder })),
        units: product.units.filter((unit) => unit.status === UnitStatus.ACTIVE).map(({ unitName, isBaseUnit, conversionToBase }) => ({ unitName, isBaseUnit, conversionToBase: conversionToBase.toString() })),
      };
      latestVersion = await this.prisma.productVersion.create({
        data: {
          productId: id,
          versionNumber: 1,
          status: ProductVersionStatus.APPROVED,
          specification: currentSnapshot,
          submittedById: user.id,
          reviewedById: product.approvedById || user.id,
          reviewedAt: product.approvedAt || product.createdAt,
          effectiveFrom: product.approvedAt || product.createdAt,
        },
      });
    }

    const version = await this.prisma.productVersion.create({
      data: {
        productId: id,
        versionNumber: latestVersion.versionNumber + 1,
        status: ProductVersionStatus.PENDING_APPROVAL,
        specification: this.specificationSnapshot(dto),
        changeReason: dto.changeReason?.trim() || null,
        submittedById: user.id,
      },
      select: {
        id: true,
        productId: true,
        versionNumber: true,
        status: true,
        changeReason: true,
        createdAt: true,
      },
    });

    this.invalidateCache();
    return version;
  }

  async reviewVersion(productId: string, versionId: string, dto: ApproveProductDto, approver: AuthenticatedUser) {
    if (approver.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can review product changes');
    }
    if (dto.decision === ApprovalDecision.REJECT && !dto.reason?.trim()) {
      throw new BadRequestException('A reason is required when rejecting product changes');
    }

    const version = await this.prisma.productVersion.findUnique({
      where: { id: versionId },
      include: { product: true },
    });
    if (!version || version.productId !== productId) throw new NotFoundException('Product change not found');
    if (version.status !== ProductVersionStatus.PENDING_APPROVAL) {
      throw new ConflictException('This product change has already been reviewed');
    }

    const now = new Date();
    if (dto.decision === ApprovalDecision.REJECT) {
      return this.prisma.productVersion.update({
        where: { id: versionId },
        data: {
          status: ProductVersionStatus.REJECTED,
          reviewedById: approver.id,
          reviewedAt: now,
          rejectionReason: dto.reason!.trim(),
        },
        select: { id: true, productId: true, versionNumber: true, status: true, rejectionReason: true },
      });
    }

    const specification = version.specification as unknown as {
      name: string; kind: 'RAW_MATERIAL' | 'MANUFACTURED_PRODUCT'; brand: string | null; description: string | null; categoryId: string;
      quantityPrecision: number; allowFractional: boolean; trackingMode: 'NONE' | 'BATCH_ONLY' | 'EXPIRY_ONLY' | 'BOTH';
      minQuantity: string; minOrderQuantity?: string; attributes: Array<{ attributeName: string; value: string; unit: string | null; sortOrder: number }>;
      units: Array<{ unitName: string; isBaseUnit: boolean; conversionToBase: string }>;
    };
    const duplicateKey = computeDuplicateKey({
      ownerScope: version.product.ownerScope,
      clientId: version.product.clientId,
      name: specification.name,
      categoryId: specification.categoryId,
      brand: specification.brand,
      attributes: specification.attributes,
    });

    const reviewed = await this.prisma.$transaction(async (tx) => {
      const duplicate = await tx.product.findUnique({ where: { duplicateKey } });
      if (duplicate && duplicate.id !== productId) {
        throw new ConflictException('An identical product already exists in this catalog');
      }

      await tx.product.update({
        where: { id: productId },
        data: {
          name: specification.name,
          kind: specification.kind,
          brand: specification.brand,
          description: specification.description,
          categoryId: specification.categoryId,
          quantityPrecision: specification.quantityPrecision,
          allowFractional: specification.allowFractional,
          trackingMode: specification.trackingMode,
          minQuantity: new Prisma.Decimal(specification.minQuantity),
          minOrderQuantity: new Prisma.Decimal(specification.minOrderQuantity || 1),
          duplicateKey,
          attributes: {
            deleteMany: {},
            create: specification.attributes,
          },
          units: {
            updateMany: {
              where: { status: UnitStatus.ACTIVE },
              data: { status: UnitStatus.SUPERSEDED, effectiveTo: now },
            },
            create: specification.units.map((unit) => ({
              ...unit,
              conversionToBase: new Prisma.Decimal(unit.conversionToBase),
              effectiveFrom: now,
            })),
          },
        },
      });

      return tx.productVersion.update({
        where: { id: versionId },
        data: {
          status: ProductVersionStatus.APPROVED,
          reviewedById: approver.id,
          reviewedAt: now,
          effectiveFrom: now,
        },
        select: { id: true, productId: true, versionNumber: true, status: true, effectiveFrom: true },
      });
    });

    this.invalidateCache();
    return reviewed;
  }

  async findAll(
    user: AuthenticatedUser,
    filters?: { status?: ProductStatus; categoryId?: string; search?: string },
  ) {
    const cacheKey = `${user.role}_${user.id}_${filters?.status || ''}_${filters?.categoryId || ''}_${filters?.search || ''}`;
    const cached = this.productsCache.get(cacheKey);
    const now = Date.now();
    if (cached && now < cached.expiresAt) {
      return cached.data;
    }

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

    let results: any[] = [];
    if (user.role === UserRole.SUPER_ADMIN) {
      // Super Admin sees all
      results = await this.prisma.product.findMany({
        where,
        include: {
          category: true,
          attributes: true,
          units: true,
          client: { select: { id: true, name: true } },
          versions: {
            where: { status: ProductVersionStatus.PENDING_APPROVAL },
            select: { id: true, versionNumber: true, status: true, changeReason: true, createdAt: true },
            orderBy: { versionNumber: 'desc' },
            take: 1,
          },
        },
        orderBy: { name: 'asc' },
      });
    } else if (user.role === UserRole.STORE_ADMIN) {
      // Store Admins only handle company raw materials; manufactured goods belong to clients.
      where.ownerScope = CatalogScope.COMPANY;
      where.kind = ProductKind.RAW_MATERIAL;
      where.status = ProductStatus.APPROVED;

      results = await this.prisma.product.findMany({
        where,
        include: {
          category: true,
          attributes: true,
          units: true,
          versions: {
            where: { status: ProductVersionStatus.PENDING_APPROVAL },
            select: { id: true, versionNumber: true, status: true, changeReason: true, createdAt: true },
            orderBy: { versionNumber: 'desc' },
            take: 1,
          },
        },
        orderBy: { name: 'asc' },
      });
    } else if (user.role === UserRole.CLIENT_ADMIN) {
      const clientOrgId =
        user.clientId ||
        (
          await this.prisma.user.findUnique({
            where: { id: user.id },
            select: { clientId: true },
          })
        )?.clientId ||
        '';

      // Client Admin sees approved company products OR products for their client
      results = await this.prisma.product.findMany({
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
          versions: {
            where: { status: ProductVersionStatus.PENDING_APPROVAL },
            select: { id: true, versionNumber: true, status: true, changeReason: true, createdAt: true },
            orderBy: { versionNumber: 'desc' },
            take: 1,
          },
        },
        orderBy: { name: 'asc' },
      });
    }

    this.productsCache.set(cacheKey, { data: results, expiresAt: now + 30_000 });
    return results;
  }

  async getManufacturingOptions(
    user: AuthenticatedUser,
    explicitClientId?: string,
  ) {
    if (
      user.role !== UserRole.CLIENT_ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        'Manufacturing options are available to Client Admins and Super Admins',
      );
    }

    let clientId =
      (user.role === UserRole.SUPER_ADMIN ? explicitClientId : null) ||
      user.clientId ||
      (
        await this.prisma.user.findUnique({
          where: { id: user.id },
          select: { clientId: true },
        })
      )?.clientId;

    if (!clientId && user.role === UserRole.SUPER_ADMIN) {
      clientId = (await this.prisma.client.findFirst({ where: { status: 'ACTIVE' } }))?.id;
    }

    if (!clientId) {
      throw new ForbiddenException('Client Admin must belong to an organization');
    }

    const location = await this.prisma.stockLocation.findUnique({ where: { clientId } });
    const catalogScope: Prisma.ProductWhereInput = {
      OR: [
        { ownerScope: CatalogScope.COMPANY },
        { ownerScope: CatalogScope.CLIENT, clientId },
      ],
    };
    const [rawMaterials, manufacturedProducts] = await Promise.all([
      location
        ? this.prisma.product.findMany({
            where: {
              kind: ProductKind.RAW_MATERIAL,
              status: ProductStatus.APPROVED,
              ...catalogScope,
              AND: [{
                OR: [
                  { balances: { some: { locationId: location.id } } },
                  { ledgerEntries: { some: { locationId: location.id } } },
                ],
              }],
            },
            include: { category: true, attributes: true, units: true },
            orderBy: { name: 'asc' },
          })
        : [],
      this.prisma.product.findMany({
        where: {
          kind: ProductKind.MANUFACTURED_PRODUCT,
          status: ProductStatus.APPROVED,
          ownerScope: CatalogScope.CLIENT,
          clientId,
        },
        include: { category: true, attributes: true, units: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return { rawMaterials, manufacturedProducts };
  }

  async findById(id: string, user: AuthenticatedUser) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        attributes: true,
        units: true,
        client: { select: { id: true, name: true } },
        versions: {
          select: { id: true, versionNumber: true, status: true, changeReason: true, createdAt: true, effectiveFrom: true, rejectionReason: true },
          orderBy: { versionNumber: 'desc' },
        },
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
    } else if (user.role === UserRole.STORE_ADMIN && (
      product.ownerScope !== CatalogScope.COMPANY || product.kind !== ProductKind.RAW_MATERIAL
    )) {
      throw new ForbiddenException('Store Admins can only access company raw materials');
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
    const reviewed = await this.prisma.$transaction(async (tx) => {
      const productResult = await tx.product.update({
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
      await tx.productVersion.updateMany({
        where: { productId: id, versionNumber: 1, status: ProductVersionStatus.PENDING_APPROVAL },
        data: {
          status: dto.decision === ApprovalDecision.APPROVE
            ? ProductVersionStatus.APPROVED
            : ProductVersionStatus.REJECTED,
          reviewedById: approver.id,
          reviewedAt: now,
          effectiveFrom: dto.decision === ApprovalDecision.APPROVE ? now : null,
          rejectionReason: dto.decision === ApprovalDecision.REJECT ? dto.reason?.trim() : null,
        },
      });
      return productResult;
    });
    await this.notificationsService.notifyClientAdmins(
      product.clientId,
      dto.decision === ApprovalDecision.APPROVE ? 'Product approved' : 'Product rejected',
      dto.decision === ApprovalDecision.APPROVE
        ? `Your product “${product.name}” was approved and is ready to use.`
        : `Your product “${product.name}” was rejected. Reason: ${dto.reason}`,
      'PRODUCT',
      product.id,
    );
    this.invalidateCache();
    return reviewed;
  }
}
