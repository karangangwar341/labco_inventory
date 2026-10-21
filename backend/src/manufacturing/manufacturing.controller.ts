import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Headers,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { UserRole, ProductionStatus } from '@prisma/client';
import { ManufacturingService } from './manufacturing.service.js';
import { CreateProductionRunDto } from './dto/create-production-run.dto.js';
import {
  ApproveProductionRunDto,
  RejectProductionRunDto,
} from './dto/decide-production-run.dto.js';
import {
  SubmitProductionRunBatchDto,
  DecideProductionRunBatchDto,
} from './dto/batch-production-run.dto.js';
import { ReRunCycleDto } from './dto/re-run-cycle.dto.js';
import { QueryManufacturingAnalyticsDto } from './dto/query-manufacturing-analytics.dto.js';

@ApiTags('Client Manufacturing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('production-runs')
export class ManufacturingController {
  constructor(private readonly manufacturingService: ManufacturingService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new client manufacturing run draft' })
  async createProductionRun(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProductionRunDto,
  ) {
    return this.manufacturingService.createProductionRun(user, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List client manufacturing runs within caller scope',
  })
  async getProductionRuns(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: ProductionStatus,
    @Query('clientId') clientId?: string,
  ) {
    return this.manufacturingService.getProductionRuns(user, status, clientId);
  }

  @Get('cycles')
  @ApiOperation({
    summary: 'List distinct production cycles with finished stock status and replenishment alerts',
  })
  async getProductionCycles(@CurrentUser() user: AuthenticatedUser) {
    return this.manufacturingService.getProductionCycles(user);
  }

  @Get('analytics')
  @ApiOperation({
    summary: 'Get manufacturing cycle analytics, yield efficiency, and execution history ledger',
  })
  async getManufacturingAnalytics(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryManufacturingAnalyticsDto,
  ) {
    return this.manufacturingService.getManufacturingAnalytics(user, query);
  }

  @Post('check-low-stock-cycles')
  @ApiOperation({
    summary: 'Scan for low-stock manufactured products and notify client admins to re-run cycles',
  })
  async checkLowStockCycles(@CurrentUser() user: AuthenticatedUser) {
    return this.manufacturingService.checkLowStockCycles(user);
  }

  @Post(':id/re-run')
  @ApiOperation({
    summary: 'Re-run an existing production cycle; generates a new draft with same formula and fresh batch number',
  })
  async reRunCycle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto?: ReRunCycleDto,
  ) {
    return this.manufacturingService.reRunCycle(user, id, dto);
  }

  @Post('batch-submit')
  @Roles(UserRole.CLIENT_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Submit multiple production runs as a Day-End batch for single approval',
  })
  async submitProductionRunBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitProductionRunBatchDto,
  ) {
    return this.manufacturingService.submitProductionRunBatch(user, dto);
  }

  @Post('batch-approve')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Super Admin approves multiple production runs together (Day-End batch)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  async approveProductionRunBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DecideProductionRunBatchDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.manufacturingService.approveProductionRunBatch(user, {
      ...dto,
      idempotencyKey: idempotencyKey || dto?.idempotencyKey,
    });
  }

  @Post('batch-reject')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Super Admin rejects multiple production runs together',
  })
  async rejectProductionRunBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DecideProductionRunBatchDto,
  ) {
    return this.manufacturingService.rejectProductionRunBatch(user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get manufacturing run details by ID' })
  async getProductionRunById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.manufacturingService.getProductionRunById(user, id);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit production run draft for approval' })
  async submitProductionRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.manufacturingService.submitProductionRun(user, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a client production run draft without changing stock',
  })
  async updateProductionRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateProductionRunDto,
  ) {
    return this.manufacturingService.updateProductionRun(user, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.CLIENT_ADMIN)
  @ApiOperation({
    summary:
      'Delete the caller’s own production draft; drafts have no inventory effect',
  })
  async deleteProductionRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.manufacturingService.deleteProductionRun(user, id);
  }

  @Post(':id/approve')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Super Admin approves production run; atomically posts input deductions and output additions',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  async approveProductionRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApproveProductionRunDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.manufacturingService.approveProductionRun(user, id, {
      ...dto,
      idempotencyKey: idempotencyKey || dto?.idempotencyKey,
    });
  }

  @Post(':id/reject')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Super Admin rejects production run' })
  async rejectProductionRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectProductionRunDto,
  ) {
    return this.manufacturingService.rejectProductionRun(user, id, dto);
  }
}
