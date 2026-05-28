import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/types/user-role.enum';
import { ShippingQuoteDto } from './dto/shipping-quote.dto';
import { UpsertShippingMethodDto } from './dto/upsert-shipping-method.dto';
import { UpsertZoneDto } from './dto/upsert-zone.dto';
import { ShippingService } from './shipping.service';

@Controller('shipping')
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  // --- methods (storefront) -----------------------------------------

  @Get('methods')
  @Public()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(600_000)
  listPublic() {
    return this.shipping.listPublic();
  }

  @Get('quote')
  @Public()
  quote(@Query() dto: ShippingQuoteDto) {
    return this.shipping.quote(
      { country: dto.country, state: dto.state, city: dto.city, postal: dto.postal },
      dto.subtotal,
    );
  }

  // --- admin: methods -----------------------------------------------

  @Get('admin/methods')
  @Roles(UserRole.ADMIN)
  listAll() {
    return this.shipping.listAll();
  }

  @Post('admin/methods')
  @Roles(UserRole.ADMIN)
  createMethod(@Body() dto: UpsertShippingMethodDto) {
    return this.shipping.upsertMethod(dto);
  }

  @Put('admin/methods/:code')
  @Roles(UserRole.ADMIN)
  updateMethod(@Param('code') code: string, @Body() dto: UpsertShippingMethodDto) {
    return this.shipping.upsertMethod({ ...dto, code });
  }

  @Delete('admin/methods/:code')
  @Roles(UserRole.ADMIN)
  removeMethod(@Param('code') code: string) {
    return this.shipping.removeMethod(code);
  }

  // --- admin: zones -------------------------------------------------

  @Get('admin/zones')
  @Roles(UserRole.ADMIN)
  listZones() {
    return this.shipping.listZones();
  }

  @Post('admin/zones')
  @Roles(UserRole.ADMIN)
  createZone(@Body() dto: UpsertZoneDto) {
    return this.shipping.upsertZone(dto);
  }

  @Put('admin/zones/:code')
  @Roles(UserRole.ADMIN)
  updateZone(@Param('code') code: string, @Body() dto: UpsertZoneDto) {
    return this.shipping.upsertZone({ ...dto, code });
  }

  @Delete('admin/zones/:code')
  @Roles(UserRole.ADMIN)
  removeZone(@Param('code') code: string) {
    return this.shipping.removeZone(code);
  }
}
