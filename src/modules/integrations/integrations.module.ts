import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IntegrationsController } from './integrations.controller';
import {
  Integration,
  IntegrationSchema,
} from './schemas/integration.schema';
import { IntegrationCryptoService } from './services/integration-crypto.service';
import { IntegrationTestService } from './services/integration-test.service';
import { IntegrationsService } from './services/integrations.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Integration.name, schema: IntegrationSchema },
    ]),
  ],
  controllers: [IntegrationsController],
  providers: [
    IntegrationCryptoService,
    IntegrationsService,
    IntegrationTestService,
  ],
  // Exported so OrdersService / PaymentsService / NotificationsService
  // can read decrypted credentials at request time.
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
