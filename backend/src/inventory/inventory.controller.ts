import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { InventoryService } from './inventory.service.js';
import { LedgerService } from './ledger.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { UserRole } from '@prisma/client';
import { CorrectTransactionDto } from './dto/correct-transaction.dto.js';

@ApiTags('Inventory Balances & Ledger')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly ledgerService: LedgerService,
  ) {}

  @Get('balances')
  @ApiOperation({
    summary: 'View current inventory balances',
    description:
      'Returns balances enriched with D-004 formulas: Physical = Usable + Damaged + Expired, Available = Usable - Reserved.',
  })
  @ApiQuery({ name: 'locationId', required: false })
  @ApiQuery({ name: 'productId', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  getBalances(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('productId') productId?: string,
    @Query('limit') limit?: number,
    @Query('page') page?: number,
  ) {
    return this.inventoryService.getBalances(user, {
      locationId,
      productId,
      limit: limit ? Number(limit) : undefined,
      page: page ? Number(page) : undefined,
    });
  }

  @Get('transactions')
  @ApiOperation({ summary: 'View immutable transaction ledger history within caller scope' })
  getTransactions(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.getTransactions(user);
  }

  @Post('transactions/reversal/:id')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reverse an existing posted transaction (Super Admin only)',
    description:
      'Appends compensating reversal ledger entries without modifying original history.',
  })
  reverseTransaction(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ledgerService.reverseTransaction(id, user.id, reason);
  }

  @Post('transactions/:id/correct')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Perform historical transaction correction with replacement lines (Super Admin only)',
    description:
      'Compensates original transaction and posts new replacement transaction in an atomic reversal/replacement cycle.',
  })
  correctTransaction(
    @Param('id') id: string,
    @Body() dto: CorrectTransactionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ledgerService.correctTransaction(id, dto, user.id);
  }
}
