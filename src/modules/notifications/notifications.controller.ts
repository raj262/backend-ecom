import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBooleanString, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtUser } from '../../common/types/jwt-user.interface';
import { UserRole } from '../../common/types/user-role.enum';
import { UsersService } from '../users/users.service';
import { DevicesService } from './devices.service';
import {
  FlashSaleBroadcastDto,
  PersonalizedOfferBroadcastDto,
} from './dto/broadcast-push.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UpdatePushPreferencesDto } from './dto/update-push-preferences.dto';
import { NotificationsService } from './notifications.service';
import {
  NotificationChannel,
  NotificationType,
} from './schemas/notification.schema';

class ListNotificationsDto {
  @IsOptional() @IsBooleanString() unreadOnly?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly devices: DevicesService,
    private readonly users: UsersService,
  ) {}

  @Get()
  list(@CurrentUser() user: JwtUser, @Query() query: ListNotificationsDto) {
    return this.notifications.listForUser(user.sub, {
      unreadOnly: query.unreadOnly === 'true',
      limit: query.limit,
    });
  }

  @Get('unread-count')
  async unread(@CurrentUser() user: JwtUser) {
    const count = await this.notifications.unreadCount(user.sub);
    return { count };
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.notifications.markRead(user.sub, id);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: JwtUser) {
    return this.notifications.markAllRead(user.sub);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.notifications.remove(user.sub, id);
  }

  // --- Device tokens ----------------------------------------------------

  @Get('devices')
  listDevices(@CurrentUser() user: JwtUser) {
    return this.devices.list(user.sub);
  }

  @Post('devices')
  registerDevice(
    @CurrentUser() user: JwtUser,
    @Body() dto: RegisterDeviceDto,
  ) {
    return this.devices.register(user.sub, dto);
  }

  @Delete('devices/:deviceId')
  unregisterDevice(
    @CurrentUser() user: JwtUser,
    @Param('deviceId') deviceId: string,
  ) {
    return this.devices.unregisterByDeviceId(user.sub, deviceId);
  }

  // --- Push preferences -------------------------------------------------

  @Get('preferences')
  async getPreferences(@CurrentUser() user: JwtUser) {
    const u = await this.users.findById(user.sub);
    return (
      u?.pushPreferences ?? {
        orderUpdates: true,
        deliveryUpdates: true,
        flashSales: true,
        cartReminders: true,
        personalizedOffers: true,
      }
    );
  }

  @Patch('preferences')
  async updatePreferences(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdatePushPreferencesDto,
  ) {
    const u = await this.users.updatePushPreferences(user.sub, dto);
    return u.pushPreferences;
  }

  /**
   * Sends a test push to every active device the caller has
   * registered — handy from the in-app "Test push" toggle while
   * setting up the notification preferences screen.
   */
  @Post('preferences/test')
  async testPush(@CurrentUser() user: JwtUser) {
    return this.notifications.create({
      userId: user.sub,
      type: NotificationType.SYSTEM,
      title: 'Hello from Lumière',
      body: 'Push is working! 🎉',
      href: '/notifications',
      channels: [NotificationChannel.IN_APP, NotificationChannel.PUSH],
      // System tests should always fire even if the user has muted
      // every product category — they're a debug aid.
      pushCategory: null,
    });
  }

  // --- Admin broadcasts -------------------------------------------------

  @Roles(UserRole.ADMIN)
  @Post('broadcast/flash-sale')
  flashSale(@Body() dto: FlashSaleBroadcastDto) {
    return this.notifications.broadcastPush('flashSales', {
      title: dto.title,
      body: dto.body,
      data: dto.url ? { url: dto.url, kind: 'flash_sale' } : { kind: 'flash_sale' },
      ttl: dto.ttlSeconds ?? 1800,
      priority: 'high',
      badge: dto.badge,
    });
  }

  @Roles(UserRole.ADMIN)
  @Post('broadcast/personalized-offers')
  personalizedOffer(@Body() dto: PersonalizedOfferBroadcastDto) {
    return this.notifications.broadcastPush('personalizedOffers', {
      title: dto.title,
      body: dto.body,
      data: dto.url
        ? { url: dto.url, kind: 'offer', category: dto.category }
        : { kind: 'offer', category: dto.category },
      priority: 'default',
    });
  }
}
