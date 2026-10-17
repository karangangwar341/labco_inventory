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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { UserRole } from '@prisma/client';
import { StaffService } from './staff.service.js';
import { CreateStaffMemberDto } from './dto/create-staff.dto.js';
import { UpdateStaffMemberDto } from './dto/update-staff.dto.js';
import { CreateWorkLogDto } from './dto/create-work-log.dto.js';

@ApiTags('Client Staff & HR Operations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('client-staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.CLIENT_ADMIN)
  @ApiOperation({ summary: 'List client staff members' })
  @ApiQuery({ name: 'clientId', required: false, description: 'Client ID (Super Admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listStaffMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Query('clientId') clientId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.staffService.listStaffMembers(user, clientId, { page, limit });
  }

  @Get('work-logs')
  @Roles(UserRole.SUPER_ADMIN, UserRole.CLIENT_ADMIN)
  @ApiOperation({ summary: 'List recent work logs across all staff for the client facility' })
  @ApiQuery({ name: 'clientId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listAllClientWorkLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Query('clientId') clientId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.staffService.listAllClientWorkLogs(user, clientId, { page, limit });
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.CLIENT_ADMIN)
  @ApiOperation({ summary: 'Get staff member profile details and work logs' })
  async getStaffMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.staffService.getStaffMember(id, user);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.CLIENT_ADMIN)
  @ApiOperation({ summary: 'Register a new staff member under the client organization' })
  async createStaffMember(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateStaffMemberDto,
  ) {
    return this.staffService.createStaffMember(dto, user);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.CLIENT_ADMIN)
  @ApiOperation({ summary: 'Update staff member profile or status' })
  async updateStaffMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateStaffMemberDto,
  ) {
    return this.staffService.updateStaffMember(id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.CLIENT_ADMIN)
  @ApiOperation({ summary: 'Delete staff member and their logged records' })
  async deleteStaffMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.staffService.deleteStaffMember(id, user);
  }

  @Get(':id/work-logs')
  @Roles(UserRole.SUPER_ADMIN, UserRole.CLIENT_ADMIN)
  @ApiOperation({ summary: 'List work logs for a specific staff member' })
  async listWorkLogsForStaff(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.staffService.listWorkLogsForStaff(id, user);
  }

  @Post(':id/work-logs')
  @Roles(UserRole.SUPER_ADMIN, UserRole.CLIENT_ADMIN)
  @ApiOperation({ summary: 'Submit a daily work log entry for a staff member' })
  async createWorkLog(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateWorkLogDto,
  ) {
    return this.staffService.createWorkLog(id, dto, user);
  }
}
