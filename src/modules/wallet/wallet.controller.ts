import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtUser } from '../../common/types/jwt-user.interface';
import { UserRole } from '../../common/types/user-role.enum';
import { WalletAdjustDto } from './dto/wallet-adjust.dto';
import { WalletEntryReason } from './schemas/wallet-ledger.schema';
import { WalletService } from './wallet.service';

@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get('me')
  me(@CurrentUser() user: JwtUser) {
    return this.wallet.getBalance(user.sub);
  }

  @Get('me/history')
  history(@CurrentUser() user: JwtUser, @Query('limit') limit?: string) {
    const n = Number.parseInt(limit ?? '', 10);
    return this.wallet.history(user.sub, Number.isFinite(n) ? n : 30);
  }

  // --- Admin ---------------------------------------------------------

  @Roles(UserRole.ADMIN)
  @Post('users/:userId/credit')
  credit(@Param('userId') userId: string, @Body() dto: WalletAdjustDto) {
    return this.wallet.credit({
      userId,
      amount: dto.amount,
      reason: WalletEntryReason.ADMIN_ADJUSTMENT,
      note: dto.note,
    });
  }
}
