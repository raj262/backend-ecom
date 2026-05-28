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
import { InitCheckoutDto } from './dto/init-checkout.dto';
import { ListPaymentsDto } from './dto/list-payments.dto';
import { MarkCapturedDto } from './dto/mark-captured.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('mine')
  mine(@CurrentUser() user: JwtUser) {
    return this.payments.listForUser(user.sub);
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.payments.findOne(user, id);
  }

  /** Gateway init: returns the blob the client SDK opens. */
  @Post(':id/checkout')
  init(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: InitCheckoutDto,
  ) {
    return this.payments.initCheckout({
      paymentId: id,
      userId: user.sub,
      customer: dto,
    });
  }

  /** Gateway verify: HMAC-checks the callback, flips order to PAID. */
  @Post(':id/verify')
  verify(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: VerifyPaymentDto,
  ) {
    return this.payments.verifyAndCapture({
      paymentId: id,
      userId: user.sub,
      signature: dto.signature,
      fields: dto.fields,
    });
  }

  // --- Admin --------------------------------------------------------

  @Roles(UserRole.ADMIN)
  @Get()
  listAll(@Query() query: ListPaymentsDto) {
    return this.payments.listAll({
      page: query.page,
      limit: query.limit,
      status: query.status,
    });
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id/capture')
  capture(@Param('id') id: string, @Body() dto: MarkCapturedDto) {
    return this.payments.markCaptured(id, dto.providerRef);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id/refund')
  refund(@Param('id') id: string) {
    return this.payments.markRefunded(id);
  }
}
