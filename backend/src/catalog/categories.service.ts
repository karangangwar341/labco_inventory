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
    let clientId: string | null = null;

    if (user.role === UserRole.CLIENT_ADMIN) {
      ownerScope = CatalogScope.CLIENT;
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { clientId: true },
      });
      if (!dbUser?.clientId) {
        throw new ForbiddenException('Client Admin must belong to an organization');
      }
      clientId = dbUser.clientId;
    }

    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException('Parent category not found');
      }
      // Cannot attach client category to company category without alignment
      if (ownerScope === CatalogScope.CLIENT && parent.ownerScope === CatalogScope.CLIENT && parent.clientId !== clientId) {
        throw new ForbiddenException('Cannot nest category under another client category');
      }
    }

    const existing = await this.prisma.category.findFirst({
      where: {
        name: normalizedName,
        ownerScope,
        clientId,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Category "${normalizedName}" already exists in this catalog scope`,
      );
    }

    return this.prisma.category.create({
      data: {
        name: normalizedName,
        parentId: dto.parentId || null,
        ownerScope,
        clientId,
      },
      include: {
        parent: true,
      },
    });
  }

  async findAll(user: AuthenticatedUser) {
    if (user.role === UserRole.SUPER_ADMIN) {
      return this.prisma.category.findMany({
        orderBy: { name: 'asc' },
        include: { children: true },
      });
    }

    if (user.role === UserRole.STORE_ADMIN) {
      // Store Admin can only view company categories
      return this.prisma.category.findMany({
        where: { ownerScope: CatalogScope.COMPANY },
        orderBy: { name: 'asc' },
        include: { children: true },
      });
    }

    if (user.role === UserRole.CLIENT_ADMIN) {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { clientId: true },
      });

      return this.prisma.category.findMany({
        where: {
          OR: [
            { ownerScope: CatalogScope.COMPANY },
            { ownerScope: CatalogScope.CLIENT, clientId: dbUser?.clientId || '' },
          ],
        },
        orderBy: { name: 'asc' },
        include: { children: true },
      });
    }

    return [];
  }
}
