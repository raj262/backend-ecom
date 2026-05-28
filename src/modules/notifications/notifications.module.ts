import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IntegrationsModule } from '../integrations/integrations.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';
import { DevicesService } from './devices.service';
import { NotificationDispatcherService } from './dispatchers/notification-dispatcher.service';
import { PushDispatcherService } from './dispatchers/push-dispatcher.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import {
  DeviceToken,
  DeviceTokenSchema,
} from './schemas/device-token.schema';
import {
  Notification,
  NotificationSchema,
} from './schemas/notification.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: DeviceToken.name, schema: DeviceTokenSchema },
      // Re-registered here so `NotificationsService` + `PushDispatcher`
      // can read `pushPreferences` without going back through
      // UsersService (avoids a circular import).
      { name: User.name, schema: UserSchema },
    ]),
    IntegrationsModule,
    UsersModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationDispatcherService,
    PushDispatcherService,
    DevicesService,
  ],
  exports: [
    NotificationsService,
    NotificationDispatcherService,
    PushDispatcherService,
    DevicesService,
  ],
})
export class NotificationsModule {}
