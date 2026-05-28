import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  HomepageContent,
  HomepageContentSchema,
} from './schemas/homepage-content.schema';
import {
  SiteSettings,
  SiteSettingsSchema,
} from './schemas/site-settings.schema';
import {
  SiteContentAdminController,
  SiteContentPublicController,
} from './site-content.controller';
import { SiteContentService } from './site-content.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SiteSettings.name, schema: SiteSettingsSchema },
      { name: HomepageContent.name, schema: HomepageContentSchema },
    ]),
  ],
  controllers: [SiteContentPublicController, SiteContentAdminController],
  providers: [SiteContentService],
  exports: [SiteContentService],
})
export class SiteContentModule {}
