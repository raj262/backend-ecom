import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtUser } from '../../common/types/jwt-user.interface';
import { UserRole } from '../../common/types/user-role.enum';
import { CourierService, type CourierDeliveryTab } from './courier.service';

@Controller('courier')
@Roles(UserRole.COURIER)
export class CourierController {
  constructor(private readonly courier: CourierService) {}

  @Get('deliveries')
  list(
    @CurrentUser() user: JwtUser,
    @Query('tab') tab?: string,
  ) {
    const t = (tab ?? 'queue') as CourierDeliveryTab;
    return this.courier.listDeliveries(user.sub, t);
  }

  @Get('deliveries/:id')
  one(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.courier.getDelivery(user.sub, id);
  }

  @Post('deliveries/:id/start')
  start(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.courier.startDelivery(user.sub, id);
  }

  @Post('deliveries/:id/complete')
  complete(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.courier.completeDelivery(user.sub, id);
  }
}
