import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AssignWarehouseDto } from './dto/assign-warehouse.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Projects & Assignments')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a project organization (Super Admin only)' })
  @ApiResponse({ status: 201, description: 'Project created successfully' })
  create(@Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN)
  @ApiOperation({ summary: 'List project organizations (scoped by caller role)' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.projectsService.findAll(user);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN)
  @ApiOperation({ summary: 'Get project details by ID' })
  findById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.projectsService.findById(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update project organization status/name (Super Admin only)' })
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, dto);
  }

  @Post(':id/warehouses')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Assign warehouse to project (Super Admin only)' })
  assignWarehouse(
    @Param('id') projectId: string,
    @Body() dto: AssignWarehouseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectsService.assignWarehouse(projectId, dto.warehouseId, user.id);
  }

  @Delete(':id/warehouses/:warehouseId')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate project warehouse assignment (Super Admin only)' })
  deactivateAssignment(
    @Param('id') projectId: string,
    @Param('warehouseId') warehouseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectsService.deactivateWarehouseAssignment(projectId, warehouseId, user.id);
  }
}
