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
import { ProductsService } from './products.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { ApproveProductDto } from './dto/approve-product.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { UserRole, ProductStatus } from '@prisma/client';

@ApiTags('Products Catalog')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.CLIENT_ADMIN)
  @ApiOperation({
    summary: 'Create product in catalog',
    description:
      'Super Admin creates company products (immediately approved). Client Admin creates client products (pending approval). Store Admin forbidden. Enforces deterministic duplicate prevention (D-003).',
  })
  @ApiResponse({ status: 201, description: 'Product created' })
  @ApiResponse({ status: 409, description: 'Duplicate product detected' })
  create(@Body() dto: CreateProductDto, @CurrentUser() user: AuthenticatedUser) {
    return this.productsService.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List catalog products within caller scope' })
  @ApiQuery({ name: 'status', enum: ProductStatus, required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: ProductStatus,
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
  ) {
    return this.productsService.findAll(user, { status, categoryId, search });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product details by ID' })
  findById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.productsService.findById(id, user);
  }

  @Post(':id/review')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve or reject a pending client product (Super Admin only)',
  })
  @ApiResponse({ status: 200, description: 'Product decision recorded' })
  review(
    @Param('id') id: string,
    @Body() dto: ApproveProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productsService.reviewProduct(id, dto, user);
  }
}
