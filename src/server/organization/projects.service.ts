import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateBulkProjectsDto } from './dto/create-bulk-projects.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import {
  UserRole,
  OrganizationStatus,
  LocationType,
  CatalogScope,
  ProductKind,
  ProductStatus,
  UnitStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { computeDuplicateKey } from '../catalog/products.service';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProjectDto) {
    const normalizedName = dto.name.trim();

    const existing = await this.prisma.project.findUnique({
      where: { name: normalizedName },
    });

    if (existing) {
      throw new ConflictException(`Project with name "${normalizedName}" already exists`);
    }

    const project = await this.prisma.project.create({
      data: {
        name: normalizedName,
        status: OrganizationStatus.ACTIVE,
      },
    });

    if (this.prisma.stockLocation?.upsert) {
      await this.prisma.stockLocation.upsert({
        where: { projectId: project.id },
        create: { locationType: LocationType.PROJECT, projectId: project.id },
        update: {},
      });
    }

    if (dto.initialProductIds?.length || dto.initialCategoryIds?.length || dto.seedAllCompanyProducts) {
      await this.cloneCompanyProductsToProject(project.id, {
        productIds: dto.initialProductIds,
        categoryIds: dto.initialCategoryIds,
      });
    }

    return project;
  }


  async createBulk(dto: CreateBulkProjectsDto, user: AuthenticatedUser) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Super Admin only can create projects');
    }

    const created: any[] = [];
    const skipped: { name: string; reason: string }[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        const normalizedName = item.name?.trim();
        if (!normalizedName) continue;

        const existing = await tx.project.findUnique({
          where: { name: normalizedName },
        });

        if (existing) {
          skipped.push({ name: normalizedName, reason: 'Project name already exists' });
          continue;
        }

        const project = await tx.project.create({
          data: {
            name: normalizedName,
            status: OrganizationStatus.ACTIVE,
          },
        });

        if (tx.stockLocation?.upsert) {
          await tx.stockLocation.upsert({
            where: { projectId: project.id },
            create: { locationType: LocationType.PROJECT, projectId: project.id },
            update: {},
          });
        }

        if (item.warehouseIds?.length) {
          for (const whId of item.warehouseIds) {
            await tx.projectWarehouseAssignment.create({
              data: {
                projectId: project.id,
                warehouseId: whId,
                isActive: true,
                changedById: user.id,
              },
            });
          }
        }

        created.push(project);
      }
    });

    return {
      totalCreated: created.length,
      totalSkipped: skipped.length,
      created,
      skipped,
    };
  }

  async findAll(currentUser: AuthenticatedUser) {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      return this.prisma.project.findMany({
        orderBy: { name: 'asc' },
        include: {
          warehouseAssignments: {
            where: { isActive: true },
            include: { warehouse: true },
          },
        },
      });
    }

    if (currentUser.role === UserRole.PROJECT_ADMIN) {
      // Find project assigned to this project admin
      const user = await this.prisma.user.findUnique({
        where: { id: currentUser.id },
      });

      if (!user?.projectId) {
        return [];
      }

      return this.prisma.project.findMany({
        where: { id: user.projectId },
        include: {
          warehouseAssignments: {
            where: { isActive: true },
            // Note REQ: Project Admin inbound views hide warehouse identity, but allowed warehouses metadata can be scoped
          },
        },
      });
    }

    throw new ForbiddenException('Store Admin cannot list project directory');
  }

  async findById(id: string, currentUser: AuthenticatedUser) {
    if (currentUser.role === UserRole.PROJECT_ADMIN) {
      const user = await this.prisma.user.findUnique({ where: { id: currentUser.id } });
      if (user?.projectId !== id) {
        throw new ForbiddenException('Access denied to other project organization data');
      }
    } else if (currentUser.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Store Admin cannot view project organization');
    }

    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        warehouseAssignments: {
          where: { isActive: true },
          include: { warehouse: true },
        },
      },
    });

    if (!project) {
      throw new NotFoundException(`Project not found`);
    }

    return project;
  }

  async update(id: string, dto: UpdateProjectDto) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new NotFoundException(`Project not found`);
    }

    if (dto.name) {
      const normalizedName = dto.name.trim();
      const existing = await this.prisma.project.findUnique({ where: { name: normalizedName } });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Project name "${normalizedName}" is already taken`);
      }
    }

    return this.prisma.project.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        status: dto.status,
      },
    });
  }

  async assignWarehouse(projectId: string, warehouseId: string, changedById: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');

    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    const existingActive = await this.prisma.projectWarehouseAssignment.findFirst({
      where: {
        projectId,
        warehouseId,
        isActive: true,
      },
    });

    if (existingActive) {
      throw new ConflictException('Warehouse is already actively assigned to this project');
    }

    return this.prisma.projectWarehouseAssignment.create({
      data: {
        projectId,
        warehouseId,
        isActive: true,
        activeFrom: new Date(),
        changedById,
      },
      include: {
        warehouse: true,
      },
    });
  }

  async deactivateWarehouseAssignment(projectId: string, warehouseId: string, changedById: string) {
    const existingActive = await this.prisma.projectWarehouseAssignment.findFirst({
      where: {
        projectId,
        warehouseId,
        isActive: true,
      },
    });

    if (!existingActive) {
      throw new NotFoundException('Active warehouse assignment not found');
    }

    return this.prisma.projectWarehouseAssignment.update({
      where: { id: existingActive.id },
      data: {
        isActive: false,
        inactiveFrom: new Date(),
        changedById,
      },
    });
  }

  async cloneCompanyProductsToProject(
    projectId: string,
    options?: { productIds?: string[]; categoryIds?: string[] } | string[],
    user?: AuthenticatedUser,
  ) {
    let productIds: string[] | undefined;
    let categoryIds: string[] | undefined;

    if (Array.isArray(options)) {
      productIds = options;
    } else if (options) {
      productIds = options.productIds;
      categoryIds = options.categoryIds;
    }

    if (user && user.role === UserRole.PROJECT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
      if (dbUser?.projectId !== projectId) {
        throw new ForbiddenException('Access denied to other project catalog');
      }
    } else if (user && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin or Project Admin can import catalog items');
    }

    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');

    let targetCategoryIds: string[] = [];
    if (categoryIds && categoryIds.length > 0) {
      const matchingCats = await this.prisma.category.findMany({
        where: {
          OR: [
            { id: { in: categoryIds } },
            { parentId: { in: categoryIds } },
          ],
        },
        select: { id: true },
      });
      targetCategoryIds = matchingCats.map((c: { id: string }) => c.id);
    }

    // 1. Clone categories into project scope if categoryIds provided
    const clonedCatMap = new Map<string, string>();
    let clonedCategoriesCount = 0;

    if (categoryIds && categoryIds.length > 0 && this.prisma.category?.findFirst && this.prisma.category?.create) {
      const catsToClone = await this.prisma.category.findMany({
        where: {
          OR: [
            { id: { in: categoryIds } },
            { parentId: { in: categoryIds } },
          ],
        },
        orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
      });

      const roots = catsToClone.filter((c: { parentId: string | null }) => !c.parentId);
      const children = catsToClone.filter((c: { parentId: string | null }) => Boolean(c.parentId));

      for (const cat of roots) {
        let existing = await this.prisma.category.findFirst({
          where: {
            name: { equals: cat.name, mode: 'insensitive' },
            parentId: null,
            ownerScope: CatalogScope.PROJECT,
            projectId,
          },
        });
        if (!existing) {
          existing = await this.prisma.category.create({
            data: {
              name: cat.name,
              parentId: null,
              ownerScope: CatalogScope.PROJECT,
              projectId,
            },
          });
          clonedCategoriesCount++;
        }
        if (existing?.id) {
          clonedCatMap.set(cat.id, existing.id);
        }
      }

      for (const cat of children) {
        const parentProjectCatId = cat.parentId ? (clonedCatMap.get(cat.parentId) || null) : null;
        let existing = await this.prisma.category.findFirst({
          where: {
            name: { equals: cat.name, mode: 'insensitive' },
            parentId: parentProjectCatId,
            ownerScope: CatalogScope.PROJECT,
            projectId,
          },
        });
        if (!existing) {
          existing = await this.prisma.category.create({
            data: {
              name: cat.name,
              parentId: parentProjectCatId,
              ownerScope: CatalogScope.PROJECT,
              projectId,
            },
          });
          clonedCategoriesCount++;
        }
        if (existing?.id) {
          clonedCatMap.set(cat.id, existing.id);
        }
      }
    }

    const sourceWhere: any = {
      ownerScope: CatalogScope.COMPANY,
      status: ProductStatus.APPROVED,
    };

    if (productIds && productIds.length > 0 && targetCategoryIds.length > 0) {
      sourceWhere.OR = [
        { id: { in: productIds } },
        { categoryId: { in: targetCategoryIds } },
      ];
    } else if (productIds && productIds.length > 0) {
      sourceWhere.id = { in: productIds };
    } else if (targetCategoryIds.length > 0) {
      sourceWhere.categoryId = { in: targetCategoryIds };
    }

    const sourceProducts = await this.prisma.product.findMany({
      where: sourceWhere,
      include: {
        units: true,
        attributes: true,
      },
    });

    const isAutoApproved = !user || user.role === UserRole.SUPER_ADMIN;
    let clonedCount = 0;
    let skippedCount = 0;

    for (const src of sourceProducts) {
      const targetCategoryId = src.categoryId ? (clonedCatMap.get(src.categoryId) || src.categoryId) : src.categoryId;

      const duplicateKey = computeDuplicateKey({
        ownerScope: CatalogScope.PROJECT,
        projectId,
        name: src.name,
        categoryId: targetCategoryId,
        brand: src.brand,
        attributes: src.attributes,
      });

      const existing = await this.prisma.product.findUnique({
        where: { duplicateKey },
      });

      if (existing) {
        skippedCount++;
        continue;
      }

      await this.prisma.product.create({
        data: {
          duplicateKey,
          name: src.name,
          brand: src.brand,
          description: src.description,
          categoryId: targetCategoryId,
          kind: ProductKind.MANUFACTURED_PRODUCT,
          ownerScope: CatalogScope.PROJECT,
          projectId,
          status: isAutoApproved ? ProductStatus.APPROVED : ProductStatus.PENDING_APPROVAL,
          quantityPrecision: src.quantityPrecision,
          allowFractional: src.allowFractional,
          minQuantity: src.minQuantity,
          units: {
            create: src.units.map((u) => ({
              unitName: u.unitName,
              isBaseUnit: u.isBaseUnit,
              conversionToBase: u.conversionToBase,
              status: UnitStatus.ACTIVE,
            })),
          },
          attributes: {
            create: src.attributes.map((a) => ({
              attributeName: a.attributeName,
              value: a.value,
              unit: a.unit,
              sortOrder: a.sortOrder,
            })),
          },
        },
      });
      clonedCount++;
    }

    return {
      success: true,
      clonedCount,
      clonedCategoriesCount,
      skippedCount,
      totalProcessed: sourceProducts.length + clonedCategoriesCount,
    };
  }
}
