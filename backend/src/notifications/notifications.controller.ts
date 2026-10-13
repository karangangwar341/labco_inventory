import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { UserRole } from '@prisma/client';
import { NotificationsService } from './notifications.service.js';
import { QueryNotificationsDto } from './dto/query-notifications.dto.js';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto.js';

@ApiTags('Notifications & Alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user in-app notifications and unread count' })
  async getNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryNotificationsDto,
  ) {
    return this.notificationsService.getNotifications(user, query);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark an in-app notification as read' })
  async markAsRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.notificationsService.markAsRead(id, user);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark all unread in-app notifications as read' })
  async markAllAsRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllAsRead(user);
  }

  @Post('check-alerts')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Trigger low-stock crossing and expiry warning checks' })
  async checkAlerts() {
    const expiryResult = await this.notificationsService.checkExpiryWarnings();
    return {
      success: true,
      expiryResult,
    };
  }

  @Get('settings')
  @ApiOperation({ summary: 'Get global notification and expiry interval settings' })
  async getSettings() {
    return this.notificationsService.getSettings();
  }

  @Patch('settings')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update global notification and expiry warning settings' })
  async updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    return this.notificationsService.updateSettings(dto, user);
  }
}
