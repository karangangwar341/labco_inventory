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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';

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
  @ApiOperation({ summary: 'Trigger low-stock crossing checks' })
  async checkAlerts() {
    return {
      success: true,
    };
  }

  @Get('settings')
  @ApiOperation({ summary: 'Get global notification settings' })
  async getSettings() {
    return this.notificationsService.getSettings();
  }

  @Patch('settings')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update global notification settings' })
  async updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    return this.notificationsService.updateSettings(dto, user);
  }
}
