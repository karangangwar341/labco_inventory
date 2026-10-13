import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
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
  @ApiOperation({ summary: 'List client manufacturing runs within caller scope' })
  async getProductionRuns(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: ProductionStatus,
  ) {
    return this.manufacturingService.getProductionRuns(user, status);
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

  @Post(':id/approve')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Super Admin approves production run; atomically posts input deductions and output additions',
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
