import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { UserRole, RequestStatus } from '@prisma/client';
import { RequestsService } from './requests.service.js';
import { CreateStockRequestDto } from './dto/create-stock-request.dto.js';
import { UpdateStockRequestDto } from './dto/update-stock-request.dto.js';
import {
  ApproveStockRequestDto,
  RejectStockRequestDto,
} from './dto/decide-stock-request.dto.js';

@ApiTags('Stock Requests & Approvals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('stock-requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new stock request draft' })
  async createDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateStockRequestDto,
  ) {
    return this.requestsService.createDraft(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List stock requests within caller scope' })
  @ApiQuery({ name: 'status', required: false, enum: RequestStatus })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  async getRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: RequestStatus,
    @Query('limit') limit?: number,
    @Query('page') page?: number,
  ) {
    return this.requestsService.getRequests(user, status, {
      limit: limit ? Number(limit) : undefined,
      page: page ? Number(page) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get stock request details by ID' })
  async getRequestById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.requestsService.getRequestById(user, id);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit request; reserve stock when applicable' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  async submitRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.requestsService.submitRequest(user, id, idempotencyKey);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit pending request; recalculates reservations' })
  async updatePendingRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateStockRequestDto,
  ) {
    return this.requestsService.updatePendingRequest(user, id, dto);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel pending request; releases reservations' })
  async cancelRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.requestsService.cancelRequest(user, id);
  }

  @Post(':id/approve')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Super Admin approves and posts stock movement' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  async approveRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApproveStockRequestDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.requestsService.approveRequest(user, id, {
      ...dto,
      idempotencyKey: idempotencyKey || dto?.idempotencyKey,
    });
  }

  @Post(':id/reject')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Super Admin rejects request; releases reservations' })
  async rejectRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectStockRequestDto,
  ) {
    return this.requestsService.rejectRequest(user, id, dto);
  }
}
