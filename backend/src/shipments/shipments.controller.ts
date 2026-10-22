import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { UserRole, ShipmentStatus } from '@prisma/client';
import { ShipmentsService } from './shipments.service.js';
import { ReceiveShipmentDto } from './dto/receive-shipment.dto.js';
import { ApproveReceiptDto } from './dto/approve-receipt.dto.js';
import { ResolveDiscrepancyDto } from './dto/resolve-discrepancy.dto.js';
import { ShipmentPrivacyInterceptor } from '../auth/interceptors/shipment-privacy.interceptor.js';

@ApiTags('Shipments & Dispatch')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(ShipmentPrivacyInterceptor)
@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Get()
  @ApiOperation({
    summary: 'List shipments within caller scope; redacts source warehouse identity for Project Admins',
  })
  @ApiQuery({ name: 'status', required: false, enum: ShipmentStatus })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  async getShipments(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: ShipmentStatus,
    @Query('limit') limit?: number,
    @Query('page') page?: number,
  ) {
    return this.shipmentsService.getShipments(user, status, {
      limit: limit ? Number(limit) : undefined,
      page: page ? Number(page) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get shipment details; redacts source warehouse identity for Project Admins',
  })
  async getShipmentById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.shipmentsService.getShipmentById(user, id);
  }

  @Post(':id/receive')
  @ApiOperation({ summary: 'Recipient records received counts and discrepancies' })
  async recordReceipt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReceiveShipmentDto,
  ) {
    return this.shipmentsService.recordReceipt(user, id, dto);
  }

  @Post(':id/approve-receipt')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Super Admin approves receipt; credits received stock and holds discrepancies (D-002)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  async approveReceipt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApproveReceiptDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.shipmentsService.approveReceipt(user, id, {
      ...dto,
      idempotencyKey: idempotencyKey || dto?.idempotencyKey,
    });
  }

  @Post(':id/resolve-discrepancy')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Super Admin marks discrepancy missing or returns it to source warehouse as a calculation mistake' })
  async resolveDiscrepancy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResolveDiscrepancyDto,
  ) {
    return this.shipmentsService.resolveDiscrepancy(user, id, dto);
  }
}
