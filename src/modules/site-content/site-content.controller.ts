import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import {
  Body,
  Controller,
  Get,
  Put,
  UseInterceptors,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/types/user-role.enum';
import { UpdateHomepageContentDto } from './dto/update-homepage-content.dto';
import { UpdateSiteSettingsDto } from './dto/update-site-settings.dto';
import { SiteContentService } from './site-content.service';

/**
 * Public, cached read endpoints. Storefront calls these on every page
 * load — the 5-minute cache keeps the database quiet.
 */
@Controller('site')
export class SiteContentPublicController {
  constructor(private readonly content: SiteContentService) {}

  @Public()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300_000)
  @Get('settings')
  settings() {
    return this.content.getSettings();
  }

  @Public()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300_000)
  @Get('homepage')
  homepage() {
    return this.content.getHomepage();
  }
}

/**
 * Admin-only write endpoints. Each PUT replaces only the provided fields
 * (Mongoose `$set` semantics), so the admin form can save one section
 * without losing the rest.
 */
@Roles(UserRole.ADMIN)
@Controller('admin/site')
export class SiteContentAdminController {
  constructor(private readonly content: SiteContentService) {}

  @Get('settings')
  settings() {
    return this.content.getSettings();
  }

  @Put('settings')
  updateSettings(@Body() dto: UpdateSiteSettingsDto) {
    return this.content.updateSettings(dto);
  }

  @Get('homepage')
  homepage() {
    return this.content.getHomepage();
  }

  @Put('homepage')
  updateHomepage(@Body() dto: UpdateHomepageContentDto) {
    return this.content.updateHomepage(dto);
  }
}
