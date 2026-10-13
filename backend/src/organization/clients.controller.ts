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
import { ClientsService } from './clients.service.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';
import { AssignWarehouseDto } from './dto/assign-warehouse.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { UserRole } from '@prisma/client';

@ApiTags('Clients & Assignments')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a client organization (Super Admin only)' })
  @ApiResponse({ status: 201, description: 'Client created successfully' })
  create(@Body() dto: CreateClientDto) {
    return this.clientsService.create(dto);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.CLIENT_ADMIN)
  @ApiOperation({ summary: 'List client organizations (scoped by caller role)' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.findAll(user);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.CLIENT_ADMIN)
  @ApiOperation({ summary: 'Get client details by ID' })
  findById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.findById(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update client organization status/name (Super Admin only)' })
  update(@Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.clientsService.update(id, dto);
  }

  @Post(':id/warehouses')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Assign warehouse to client (Super Admin only)' })
  assignWarehouse(
    @Param('id') clientId: string,
    @Body() dto: AssignWarehouseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clientsService.assignWarehouse(clientId, dto.warehouseId, user.id);
  }

  @Delete(':id/warehouses/:warehouseId')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate client warehouse assignment (Super Admin only)' })
  deactivateAssignment(
    @Param('id') clientId: string,
    @Param('warehouseId') warehouseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clientsService.deactivateWarehouseAssignment(clientId, warehouseId, user.id);
  }
}
