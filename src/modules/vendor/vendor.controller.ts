import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtUser } from '../../common/types/jwt-user.interface';
import { UserRole } from '../../common/types/user-role.enum';
import { VendorService } from './vendor.service';

@Controller('vendor')
@Roles(UserRole.VENDOR)
export class VendorController {
  constructor(private readonly vendor: VendorService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: JwtUser) {
    return this.vendor.dashboard(user.sub);
  }

  @Get('orders')
  orders(
    @CurrentUser() user: JwtUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = Number.parseInt(page ?? '', 10);
    const l = Number.parseInt(limit ?? '', 10);
    return this.vendor.listOrders(
      user.sub,
      Number.isFinite(p) ? p : 1,
      Number.isFinite(l) ? l : 20,
    );
  }

  @Get('earnings')
  earnings(@CurrentUser() user: JwtUser) {
    return this.vendor.earnings(user.sub);
  }
}
