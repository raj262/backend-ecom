import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtUser } from '../../common/types/jwt-user.interface';
import { UserRole } from '../../common/types/user-role.enum';
import { OrdersService } from '../orders/orders.service';
import { ReviewsService } from '../reviews/reviews.service';
import { UsersService } from '../users/users.service';
import { ChangeRoleDto } from './dto/change-role.dto';
import { AdminCreateUserDto } from './dto/create-user.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { ListReviewsDto } from './dto/list-reviews.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

/**
 * Admin console. Class-level @Roles(ADMIN) means every handler below
 * automatically requires the admin role via the global RolesGuard.
 *
 * Controllers stay thin: every method here is a single delegation to a
 * service. Authorization rules that depend on the *actor* (self-demotion,
 * self-deactivation, etc.) live in those services, not here.
 */
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly users: UsersService,
    private readonly orders: OrdersService,
    private readonly reviews: ReviewsService,
  ) {}

  // --- Users ---------------------------------------------------------

  @Get('users')
  listUsers(@Query() query: ListUsersDto) {
    return this.users.paginate({
      page: query.page,
      limit: query.limit,
      role: query.role,
      q: query.q,
    });
  }

  @Post('users')
  async createUser(@Body() dto: AdminCreateUserDto) {
    const user = await this.users.adminCreate(dto);
    return this.users.toPublic(user);
  }

  @Patch('users/:id/role')
  async changeRole(
    @CurrentUser() actor: JwtUser,
    @Param('id') id: string,
    @Body() dto: ChangeRoleDto,
  ) {
    const user = await this.users.setRole(
      actor.sub,
      id,
      dto.role,
      dto.customRoleKey,
    );
    return this.users.toPublic(user);
  }

  @Patch('users/:id/deactivate')
  async deactivate(@CurrentUser() actor: JwtUser, @Param('id') id: string) {
    const user = await this.users.setActive(actor.sub, id, false);
    return this.users.toPublic(user);
  }

  @Patch('users/:id/activate')
  async activate(@CurrentUser() actor: JwtUser, @Param('id') id: string) {
    const user = await this.users.setActive(actor.sub, id, true);
    return this.users.toPublic(user);
  }

  // --- Orders --------------------------------------------------------

  @Get('orders')
  listOrders(@Query() query: ListOrdersDto) {
    return this.orders.listAll({
      page: query.page,
      limit: query.limit,
      status: query.status,
    });
  }

  @Patch('orders/:id/status')
  updateOrderStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orders.setStatus(id, dto.status, { tracking: dto.tracking });
  }

  // --- Reviews -------------------------------------------------------

  @Get('reviews')
  listReviews(@Query() query: ListReviewsDto) {
    return this.reviews.listAll({
      page: query.page,
      limit: query.limit,
      productId: query.productId,
      minRating: query.minRating,
    });
  }
}
