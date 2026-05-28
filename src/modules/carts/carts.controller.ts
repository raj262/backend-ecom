import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user.interface';
import { CartsService } from './carts.service';
import { AddItemDto, UpdateItemDto } from './dto/add-item.dto';
import { ApplyCouponDto } from './dto/apply-coupon.dto';
import { MergeCartDto } from './dto/merge-cart.dto';

@Controller('cart')
export class CartsController {
  constructor(private readonly carts: CartsService) {}

  @Get()
  get(@CurrentUser() user: JwtUser) {
    return this.carts.get(user.sub);
  }

  @Post('items')
  add(@CurrentUser() user: JwtUser, @Body() dto: AddItemDto) {
    return this.carts.addItem(user.sub, dto);
  }

  @Patch('items/:productId')
  update(
    @CurrentUser() user: JwtUser,
    @Param('productId') productId: string,
    @Body() dto: UpdateItemDto,
  ) {
    return this.carts.updateItem(user.sub, productId, dto);
  }

  @Delete('items/:productId')
  remove(
    @CurrentUser() user: JwtUser,
    @Param('productId') productId: string,
  ) {
    return this.carts.removeItem(user.sub, productId);
  }

  @Delete()
  clear(@CurrentUser() user: JwtUser) {
    return this.carts.clear(user.sub);
  }

  @Post('coupon')
  applyCoupon(@CurrentUser() user: JwtUser, @Body() dto: ApplyCouponDto) {
    return this.carts.applyCoupon(user.sub, dto.code ?? null);
  }

  @Post('merge')
  merge(@CurrentUser() user: JwtUser, @Body() dto: MergeCartDto) {
    return this.carts.mergeGuestCart(user.sub, dto);
  }
}
