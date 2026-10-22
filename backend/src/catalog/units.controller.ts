import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UnitsService } from './units.service.js';
import { CreateUnitDto } from './dto/create-unit.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { UserRole } from '@prisma/client';

@ApiTags('Units')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('units')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Get()
  @ApiOperation({
    summary: 'List standard measurement units and catalog usage stats',
    description: 'Returns all standard unit templates with real-time product count across catalog items.',
  })
  @ApiResponse({ status: 200, description: 'List of standard units with catalog usage statistics' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.unitsService.findAll(user);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Add a new standard unit template',
    description: 'Super Admin only. Adds a new standard measurement unit available across product workflows.',
  })
  @ApiResponse({ status: 201, description: 'Unit template created successfully' })
  @ApiResponse({ status: 409, description: 'Unit with this name already exists' })
  create(@Body() dto: CreateUnitDto, @CurrentUser() user: AuthenticatedUser) {
    return this.unitsService.create(dto, user);
  }

  @Delete(':name')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove or hide a standard unit template',
    description: 'Super Admin only. Removes a custom unit template or hides a built-in standard unit template.',
  })
  @ApiResponse({ status: 200, description: 'Unit template removed successfully' })
  @ApiResponse({ status: 404, description: 'Unit template not found' })
  delete(@Param('name') name: string, @CurrentUser() user: AuthenticatedUser) {
    return this.unitsService.delete(name, user);
  }
}
