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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { UserRole, ImportType, ImportBatchStatus } from '@prisma/client';
import { ImportsService } from './imports.service.js';
import { CreateImportBatchDto } from './dto/create-import-batch.dto.js';
import { UpdateImportRowDto } from './dto/update-import-row.dto.js';
import { SubmitImportBatchDto } from './dto/submit-import-batch.dto.js';
import {
  ApproveImportBatchDto,
  RejectImportBatchDto,
} from './dto/decide-import-batch.dto.js';

@ApiTags('Bulk Imports & AI Extraction')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('import-batches')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.STORE_ADMIN, UserRole.PROJECT_ADMIN)
  @ApiOperation({ summary: 'Upload document/CSV and create import batch draft (no stock effect)' })
  async createBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateImportBatchDto,
  ) {
    return this.importsService.createBatch(dto, user);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.STORE_ADMIN, UserRole.PROJECT_ADMIN)
  @ApiOperation({ summary: 'List import batches within caller scope' })
  async getBatches(
    @CurrentUser() user: AuthenticatedUser,
    @Query('importType') importType?: ImportType,
    @Query('status') status?: ImportBatchStatus,
  ) {
    return this.importsService.getBatches({ importType, status }, user);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.STORE_ADMIN, UserRole.PROJECT_ADMIN)
  @ApiOperation({ summary: 'Get import batch details and rows with validation errors' })
  async getBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.importsService.getBatch(id, user);
  }

  @Post(':id/validate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.STORE_ADMIN, UserRole.PROJECT_ADMIN)
  @ApiOperation({ summary: 'Re-run server-side row validation on batch' })
  async validateBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.importsService.validateBatch(id, user);
  }

  @Post(':id/submit')
  @Roles(UserRole.SUPER_ADMIN, UserRole.STORE_ADMIN, UserRole.PROJECT_ADMIN)
  @ApiOperation({ summary: 'Submit a validated import batch for Super Admin review; no inventory changes occur' })
  async submitBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SubmitImportBatchDto,
  ) {
    return this.importsService.submitBatch(id, dto, user);
  }

  @Patch(':batchId/rows/:rowId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.STORE_ADMIN, UserRole.PROJECT_ADMIN)
  @ApiOperation({ summary: 'Correct row fields without re-upload (preserves original extraction)' })
  async updateRow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('batchId') batchId: string,
    @Param('rowId') rowId: string,
    @Body() dto: UpdateImportRowDto,
  ) {
    return this.importsService.updateRow(batchId, rowId, dto, user);
  }

  @Post(':id/approve')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({ summary: 'Super Admin approves batch (ALL_OR_NOTHING or PARTIAL posting)' })
  async approveBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApproveImportBatchDto,
    @Headers('Idempotency-Key') headerIdempotencyKey?: string,
  ) {
    const finalDto = {
      ...dto,
      idempotencyKey: headerIdempotencyKey || dto.idempotencyKey,
    };
    return this.importsService.approveBatch(id, finalDto, user);
  }

  @Post(':id/reject')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Super Admin rejects import batch' })
  async rejectBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectImportBatchDto,
  ) {
    return this.importsService.rejectBatch(id, dto, user);
  }

  @Get(':id/errors')
  @Roles(UserRole.SUPER_ADMIN, UserRole.STORE_ADMIN, UserRole.PROJECT_ADMIN)
  @ApiOperation({ summary: 'Export batch validation errors with formula-injection neutralization' })
  async exportErrors(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.importsService.exportErrors(id, user);
  }
}
