import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  WalletEntryReason,
  WalletEntryType,
} from '../wallet/schemas/wallet-ledger.schema';
import { WalletService } from '../wallet/wallet.service';

const REFERRER_BONUS = 100;
const REFEREE_BONUS = 50;

@Injectable()
export class LoyaltyService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly wallet: WalletService,
  ) {}

  async getProgram(userId: string) {
    const user = await this.requireUser(userId);
    const code = await this.ensureReferralCode(user);

    const referralsCount = await this.userModel.countDocuments({
      referredBy: new Types.ObjectId(userId),
    });

    const history = await this.wallet.history(userId, 100);
    const cashbackEarned = history
      .filter(
        (e) =>
          e.reason === WalletEntryReason.CASHBACK &&
          e.type === WalletEntryType.CREDIT,
      )
      .reduce((sum, e) => sum + e.amount, 0);
    const referralEarned = history
      .filter(
        (e) =>
          e.reason === WalletEntryReason.REFERRAL &&
          e.type === WalletEntryType.CREDIT,
      )
      .reduce((sum, e) => sum + e.amount, 0);

    const balance = await this.wallet.getBalance(userId);

    return {
      coins: balance.balance,
      currency: balance.currency,
      referralCode: code,
      referralsCount,
      cashbackEarned,
      referralEarned,
      referredBy: user.referredBy?.toString() ?? null,
      rewards: this.rewardTiers(referralsCount, balance.balance),
    };
  }

  async applyReferral(userId: string, rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    if (!code) throw new BadRequestException('Invalid referral code');

    const user = await this.requireUser(userId);
    if (user.referredBy) {
      throw new ConflictException('You have already applied a referral code');
    }

    const referrer = await this.userModel
      .findOne({ referralCode: code })
      .select('_id referralCode')
      .exec();
    if (!referrer) throw new NotFoundException('Referral code not found');
    if (referrer._id.toString() === userId) {
      throw new BadRequestException('You cannot use your own referral code');
    }

    await this.userModel.updateOne(
      { _id: user._id },
      { $set: { referredBy: referrer._id } },
    );

    await this.wallet.credit({
      userId: referrer._id.toString(),
      amount: REFERRER_BONUS,
      reason: WalletEntryReason.REFERRAL,
      note: `Referral reward — friend joined`,
    });
    await this.wallet.credit({
      userId,
      amount: REFEREE_BONUS,
      reason: WalletEntryReason.SIGNUP_BONUS,
      note: `Welcome bonus — referral applied`,
    });

    return this.getProgram(userId);
  }

  private async requireUser(userId: string) {
    if (!Types.ObjectId.isValid(userId)) throw new NotFoundException();
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async ensureReferralCode(user: UserDocument): Promise<string> {
    if (user.referralCode) return user.referralCode;
    let code = '';
    for (let attempt = 0; attempt < 8; attempt++) {
      code = this.generateCode();
      const clash = await this.userModel.exists({ referralCode: code });
      if (!clash) break;
    }
    await this.userModel.updateOne(
      { _id: user._id },
      { $set: { referralCode: code } },
    );
    return code;
  }

  private generateCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = 'LUM';
    for (let i = 0; i < 5; i++) {
      out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return out;
  }

  private rewardTiers(referrals: number, coins: number) {
    return [
      {
        id: 'welcome',
        title: 'Welcome gift',
        description: 'Apply a friend’s referral code for ₹50 wallet credit.',
        unlocked: true,
      },
      {
        id: 'refer-3',
        title: 'Style ambassador',
        description: 'Refer 3 friends to unlock early access drops.',
        unlocked: referrals >= 3,
      },
      {
        id: 'coins-500',
        title: 'Gold circle',
        description: 'Accumulate ₹500 in Lumière Coins for VIP shipping.',
        unlocked: coins >= 500,
      },
    ];
  }
}
