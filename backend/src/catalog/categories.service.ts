import {
  Injectable,
  ForbiddenException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UserRole, CatalogScope } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

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
      if (ownerScope === CatalogScope.PROJECT && (parent.ownerScope !== CatalogScope.PROJECT || parent.projectId !== projectId)) {
        throw new ForbiddenException('Project categories can only be nested under a category owned by the same project');
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
          ownerScope: CatalogScope.PROJECT,
          projectId: dbUser?.projectId || '',
        },
        orderBy: { name: 'asc' },
        include: { children: true },
      });
    }

    this.categoriesCache.set(cacheKey, { data: categories, expiresAt: now + 45_000 });
    return categories;
  }
}
