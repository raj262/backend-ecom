import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user.interface';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';
import {
  CreateSavedPaymentDto,
  UpdateSavedPaymentDto,
} from './dto/saved-payment.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UploadAvatarDto } from './dto/upload-avatar.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  async me(@CurrentUser() jwtUser: JwtUser) {
    const user = await this.users.findById(jwtUser.sub);
    if (!user) throw new NotFoundException('User not found');
    return this.users.toPublic(user);
  }

  @Patch('me')
  async update(
    @CurrentUser() jwtUser: JwtUser,
    @Body() dto: UpdateUserDto,
  ) {
    const user = await this.users.update(jwtUser.sub, dto);
    return this.users.toPublic(user);
  }

  @Post('me/avatar')
  uploadAvatar(
    @CurrentUser() jwtUser: JwtUser,
    @Body() dto: UploadAvatarDto,
  ) {
    return this.users.uploadAvatar(jwtUser.sub, dto);
  }

  @Delete('me/avatar')
  clearAvatar(@CurrentUser() jwtUser: JwtUser) {
    return this.users.clearAvatar(jwtUser.sub);
  }

  // --- Address book -------------------------------------------------

  @Get('me/addresses')
  listAddresses(@CurrentUser() jwtUser: JwtUser) {
    return this.users.listAddresses(jwtUser.sub);
  }

  @Post('me/addresses')
  addAddress(
    @CurrentUser() jwtUser: JwtUser,
    @Body() dto: CreateAddressDto,
  ) {
    return this.users.addAddress(jwtUser.sub, dto);
  }

  @Patch('me/addresses/:id')
  updateAddress(
    @CurrentUser() jwtUser: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.users.updateAddress(jwtUser.sub, id, dto);
  }

  @Delete('me/addresses/:id')
  deleteAddress(
    @CurrentUser() jwtUser: JwtUser,
    @Param('id') id: string,
  ) {
    return this.users.removeAddress(jwtUser.sub, id);
  }

  @Post('me/addresses/:id/default')
  setDefault(
    @CurrentUser() jwtUser: JwtUser,
    @Param('id') id: string,
  ) {
    return this.users.setDefaultAddress(jwtUser.sub, id);
  }

  // --- Saved payment methods ----------------------------------------

  @Get('me/payment-methods')
  listSavedPayments(@CurrentUser() jwtUser: JwtUser) {
    return this.users.listSavedPayments(jwtUser.sub);
  }

  @Post('me/payment-methods')
  addSavedPayment(
    @CurrentUser() jwtUser: JwtUser,
    @Body() dto: CreateSavedPaymentDto,
  ) {
    return this.users.addSavedPayment(jwtUser.sub, dto);
  }

  @Patch('me/payment-methods/:id')
  updateSavedPayment(
    @CurrentUser() jwtUser: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateSavedPaymentDto,
  ) {
    return this.users.updateSavedPayment(jwtUser.sub, id, dto);
  }

  @Delete('me/payment-methods/:id')
  deleteSavedPayment(
    @CurrentUser() jwtUser: JwtUser,
    @Param('id') id: string,
  ) {
    return this.users.removeSavedPayment(jwtUser.sub, id);
  }

  @Post('me/payment-methods/:id/default')
  setDefaultSavedPayment(
    @CurrentUser() jwtUser: JwtUser,
    @Param('id') id: string,
  ) {
    return this.users.setDefaultSavedPayment(jwtUser.sub, id);
  }
}
