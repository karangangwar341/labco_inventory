import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import { UserRole, OrganizationStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

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

    return this.prisma.project.create({
      data: {
        name: normalizedName,
        status: OrganizationStatus.ACTIVE,
      },
    });
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
}
