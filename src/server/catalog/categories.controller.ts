import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateBulkCategoriesDto } from './dto/create-bulk-categories.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Categories')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN)
  @ApiOperation({
    summary: 'Create a product category',
    description: 'Super Admin creates company categories; Project Admin creates project-scoped categories. Store Admin forbidden.',
  })
  @ApiResponse({ status: 201, description: 'Category created' })
  create(@Body() dto: CreateCategoryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.categoriesService.create(dto, user);
  }


  @Post('bulk')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN)
  @ApiOperation({ summary: 'Bulk create product categories and subcategories' })
  @ApiResponse({ status: 201, description: 'Bulk categories created' })
  createBulk(@Body() dto: CreateBulkCategoriesDto, @CurrentUser() user: AuthenticatedUser) {
    return this.categoriesService.createBulk(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List categories within caller scope' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.categoriesService.findAll(user);
  }
}
