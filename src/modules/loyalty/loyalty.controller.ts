import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user.interface';
import { ApplyReferralDto } from './dto/apply-referral.dto';
import { LoyaltyService } from './loyalty.service';

@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get('me')
  me(@CurrentUser() user: JwtUser) {
    return this.loyalty.getProgram(user.sub);
  }

  @Post('referral/apply')
  apply(@CurrentUser() user: JwtUser, @Body() dto: ApplyReferralDto) {
    return this.loyalty.applyReferral(user.sub, dto.code);
  }
}
