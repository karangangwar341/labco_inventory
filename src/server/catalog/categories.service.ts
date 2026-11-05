import {
  Injectable,
  ForbiddenException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateBulkCategoriesDto } from './dto/create-bulk-categories.dto';
import { UserRole, CatalogScope } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto, user: AuthenticatedUser) {
    if (user.role === UserRole.STORE_ADMIN) {
      throw new ForbiddenException('Store Admin cannot create product categories');
    }

    const normalizedName = dto.name.trim();
    let ownerScope: CatalogScope = CatalogScope.COMPANY;
    let projectId: string | null = null;

    if (user.role === UserRole.PROJECT_ADMIN) {
      ownerScope = CatalogScope.PROJECT;
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { projectId: true },
      });
      if (!dbUser?.projectId) {
        throw new ForbiddenException('Project Admin must belong to an organization');
      }
      projectId = dbUser.projectId;
    }

    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException('Parent category not found');
      }
      if (parent.parentId) {
        throw new ConflictException('Categories can only have one level of subcategories. Choose a main category as the parent.');
      }
      if (ownerScope === CatalogScope.COMPANY && parent.ownerScope !== CatalogScope.COMPANY) {
        throw new ForbiddenException('Company categories cannot be nested under project categories');
      }
      if (
        ownerScope === CatalogScope.PROJECT &&
        parent.ownerScope !== CatalogScope.COMPANY &&
        (parent.ownerScope !== CatalogScope.PROJECT || parent.projectId !== projectId)
      ) {
        throw new ForbiddenException('Project categories can only be nested under a company category or a category owned by the same project');
      }
    }

    const existing = await this.prisma.category.findFirst({
      where: {
        name: normalizedName,
        ownerScope,
        projectId,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Category "${normalizedName}" already exists in this catalog scope`,
      );
    }

    const created = await this.prisma.category.create({
      data: {
        name: normalizedName,
        parentId: dto.parentId || null,
        ownerScope,
        projectId,
      },
      include: {
        parent: true,
      },
    });

    this.categoriesCache.clear();
    return created;
  }

  private categoriesCache = new Map<string, { data: any[]; expiresAt: number }>();

  
  async createBulk(dto: CreateBulkCategoriesDto, user: AuthenticatedUser) {
    if (user.role === UserRole.STORE_ADMIN) {
      throw new ForbiddenException('Store Admin cannot create product categories');
    }

    let defaultOwnerScope: CatalogScope = CatalogScope.COMPANY;
    let defaultProjectId: string | null = null;

    if (user.role === UserRole.PROJECT_ADMIN) {
      defaultOwnerScope = CatalogScope.PROJECT;
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { projectId: true },
      });
      if (!dbUser?.projectId) {
        throw new ForbiddenException('Project Admin must belong to an organization');
      }
      defaultProjectId = dbUser.projectId;
    }

    const created: any[] = [];
    const skipped: { name: string; reason: string }[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        const normalizedName = item.name?.trim();
        if (!normalizedName) continue;

        let itemOwnerScope = defaultOwnerScope;
        let itemProjectId = defaultProjectId;

        if (user.role === UserRole.SUPER_ADMIN) {
          if (item.projectId) {
            itemOwnerScope = CatalogScope.PROJECT;
            itemProjectId = item.projectId;
          } else if (item.ownerScope === CatalogScope.PROJECT) {
            itemOwnerScope = CatalogScope.PROJECT;
            itemProjectId = item.projectId || null;
          }
        }

        let parentId: string | null = item.parentId || null;

        if (item.parentName?.trim() && !parentId) {
          const parentNorm = item.parentName.trim();
          let parent = await tx.category.findFirst({
            where: {
              name: { equals: parentNorm, mode: 'insensitive' },
              parentId: null,
              ownerScope: itemOwnerScope,
              projectId: itemProjectId,
            },
          });
          if (!parent) {
            parent = await tx.category.create({
              data: {
                name: parentNorm,
                parentId: null,
                ownerScope: itemOwnerScope,
                projectId: itemProjectId,
              },
            });
            created.push(parent);
          }
          parentId = parent.id;
        }

        const existing = await tx.category.findFirst({
          where: {
            name: { equals: normalizedName, mode: 'insensitive' },
            parentId,
            ownerScope: itemOwnerScope,
            projectId: itemProjectId,
          },
        });

        if (existing) {
          skipped.push({ name: normalizedName, reason: 'Category already exists in scope' });
          continue;
        }

        const cat = await tx.category.create({
          data: {
            name: normalizedName,
            parentId,
            ownerScope: itemOwnerScope,
            projectId: itemProjectId,
          },
          include: { parent: true },
        });
        created.push(cat);
      }
    });

    this.categoriesCache.clear();
    return {
      totalCreated: created.length,
      totalSkipped: skipped.length,
      created,
      skipped,
    };
  }

  async findAll(user: AuthenticatedUser) {
    const cacheKey = `${user.role}_${user.id}_${user.projectId || ''}`;
    const cached = this.categoriesCache.get(cacheKey);
    const now = Date.now();
    if (cached && now < cached.expiresAt) {
      return cached.data;
    }

    let categories: any[] = [];
    if (user.role === UserRole.SUPER_ADMIN) {
      categories = await this.prisma.category.findMany({
        orderBy: { name: 'asc' },
        include: { children: true },
      });
    } else if (user.role === UserRole.STORE_ADMIN) {
      // Store Admin can only view company categories
      categories = await this.prisma.category.findMany({
        where: { ownerScope: CatalogScope.COMPANY },
        orderBy: { name: 'asc' },
        include: { children: true },
      });
    } else if (user.role === UserRole.PROJECT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { projectId: true },
      });

      categories = await this.prisma.category.findMany({
        where: {
          OR: [
            { ownerScope: CatalogScope.COMPANY },
            ...(dbUser?.projectId
              ? [
                  {
                    ownerScope: CatalogScope.PROJECT,
                    projectId: dbUser.projectId,
                  },
                ]
              : []),
          ],
        },
        orderBy: { name: 'asc' },
        include: { children: true },
      });
    }

    this.categoriesCache.set(cacheKey, { data: categories, expiresAt: now + 45_000 });
    return categories;
  }

  async update(id: string, dto: UpdateCategoryDto, user: AuthenticatedUser) {
    if (user.role === UserRole.STORE_ADMIN) {
      throw new ForbiddenException('Store Admin cannot edit product categories');
    }

    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { children: true },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Authorization check
    if (user.role === UserRole.PROJECT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { projectId: true },
      });
      if (!dbUser?.projectId || category.ownerScope !== CatalogScope.PROJECT || category.projectId !== dbUser.projectId) {
        throw new ForbiddenException('Project Admin can only edit categories owned by their project');
      }
    }

    const nextName = dto.name !== undefined ? dto.name.trim() : category.name;
    if (!nextName) {
      throw new BadRequestException('Category name cannot be empty');
    }

    let nextParentId = category.parentId;
    if (dto.parentId !== undefined) {
      nextParentId = dto.parentId || null;
    }

    // Validate parent hierarchy if parentId is changed
    if (nextParentId && nextParentId !== category.parentId) {
      if (nextParentId === id) {
        throw new BadRequestException('A category cannot be its own parent');
      }
      if (category.children.length > 0) {
        throw new ConflictException('A category that has subcategories cannot be converted into a subcategory');
      }

      const parent = await this.prisma.category.findUnique({
        where: { id: nextParentId },
      });
      if (!parent) {
        throw new NotFoundException('Parent category not found');
      }
      if (parent.parentId) {
        throw new ConflictException('Categories can only have one level of subcategories. Choose a main category as parent.');
      }
      if (category.ownerScope === CatalogScope.COMPANY && parent.ownerScope !== CatalogScope.COMPANY) {
        throw new ForbiddenException('Company categories cannot be nested under project categories');
      }
      if (
        category.ownerScope === CatalogScope.PROJECT &&
        parent.ownerScope !== CatalogScope.COMPANY &&
        (parent.ownerScope !== CatalogScope.PROJECT || parent.projectId !== category.projectId)
      ) {
        throw new ForbiddenException('Project categories can only be nested under a company category or a category owned by the same project');
      }
    }

    // Check duplicate name within the same scope
    if (nextName.toLowerCase() !== category.name.toLowerCase() || nextParentId !== category.parentId) {
      const duplicate = await this.prisma.category.findFirst({
        where: {
          id: { not: id },
          name: { equals: nextName, mode: 'insensitive' },
          parentId: nextParentId,
          ownerScope: category.ownerScope,
          projectId: category.projectId,
        },
      });
      if (duplicate) {
        throw new ConflictException(`Category "${nextName}" already exists in this catalog scope`);
      }
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        name: nextName,
        parentId: nextParentId,
      },
      include: {
        parent: true,
        children: true,
      },
    });

    this.categoriesCache.clear();
    return updated;
  }

  async delete(id: string, user: AuthenticatedUser) {
    if (user.role === UserRole.STORE_ADMIN) {
      throw new ForbiddenException('Store Admin cannot delete product categories');
    }

    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        children: { select: { id: true, name: true } },
        products: { select: { id: true, name: true } },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Authorization check
    if (user.role === UserRole.PROJECT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { projectId: true },
      });
      if (!dbUser?.projectId || category.ownerScope !== CatalogScope.PROJECT || category.projectId !== dbUser.projectId) {
        throw new ForbiddenException('Project Admin can only delete categories owned by their project');
      }
    }

    // Guard: Prevent deletion if products directly assigned
    if (category.products.length > 0) {
      throw new ConflictException(
        `Cannot delete category "${category.name}" because it is currently assigned to ${category.products.length} product(s). Please reassign or delete those products first.`
      );
    }

    // Guard: Prevent deletion if child subcategories have products
    if (category.children.length > 0) {
      const childIds = category.children.map((c) => c.id);
      const childProductsCount = await this.prisma.product.count({
        where: { categoryId: { in: childIds } },
      });
      if (childProductsCount > 0) {
        throw new ConflictException(
          `Cannot delete category "${category.name}" because its subcategories contain ${childProductsCount} product(s). Please reassign or delete those products first.`
        );
      }
    }

    // Delete subcategories and category in transaction
    await this.prisma.$transaction(async (tx) => {
      if (category.children.length > 0) {
        await tx.category.deleteMany({
          where: { parentId: id },
        });
      }
      await tx.category.delete({
        where: { id },
      });
    });

    this.categoriesCache.clear();
    return { success: true, message: `Category "${category.name}" deleted successfully` };
  }
}
