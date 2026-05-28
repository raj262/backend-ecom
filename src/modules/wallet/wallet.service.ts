import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { round2 } from '../../utils/money';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  WalletEntryReason,
  WalletEntryType,
  WalletLedger,
  WalletLedgerDocument,
} from './schemas/wallet-ledger.schema';

export interface WalletBalance {
  balance: number;
  currency: 'INR';
}

export interface WalletEntry {
  id: string;
  type: WalletEntryType;
  reason: WalletEntryReason;
  amount: number;
  balanceAfter: number;
  note?: string;
  orderId?: string;
  createdAt: Date;
}

interface DebitInput {
  userId: string;
  amount: number;
  reason: WalletEntryReason;
  orderId?: string;
  note?: string;
}

interface CreditInput {
  userId: string;
  amount: number;
  reason: WalletEntryReason;
  orderId?: string;
  note?: string;
  type?: WalletEntryType.CREDIT | WalletEntryType.REFUND;
}

/**
 * Wallet operations are guarded by a conditional `updateOne` —
 * `findByIdAndUpdate({ _id, walletBalance: { $gte: amount } }, { $inc })`
 * — so a concurrent debit can never push the balance negative even
 * under high contention.
 */
@Injectable()
export class WalletService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(WalletLedger.name)
    private readonly ledgerModel: Model<WalletLedgerDocument>,
  ) {}

  async getBalance(userId: string): Promise<WalletBalance> {
    if (!Types.ObjectId.isValid(userId)) throw new NotFoundException();
    const u = await this.userModel
      .findById(userId)
      .select('walletBalance')
      .exec();
    if (!u) throw new NotFoundException('User not found');
    return { balance: round2(u.walletBalance ?? 0), currency: 'INR' };
  }

  async history(userId: string, limit = 30): Promise<WalletEntry[]> {
    if (!Types.ObjectId.isValid(userId)) throw new NotFoundException();
    const rows = await this.ledgerModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(Math.min(100, Math.max(1, limit)))
      .exec();
    return rows.map((r) => this.toEntry(r));
  }

  /**
   * Debit a user's wallet atomically. Returns the new balance + the
   * ledger entry. Throws BadRequest if the balance is insufficient.
   */
  async debit(input: DebitInput): Promise<{ entry: WalletEntry; balance: number }> {
    const amount = round2(input.amount);
    if (amount <= 0) throw new BadRequestException('Amount must be positive');

    const oid = new Types.ObjectId(input.userId);
    const result = await this.userModel
      .findOneAndUpdate(
        { _id: oid, walletBalance: { $gte: amount } },
        { $inc: { walletBalance: -amount } },
        { new: true, projection: { walletBalance: 1 } },
      )
      .exec();
    if (!result) {
      throw new BadRequestException('Insufficient wallet balance');
    }
    const balance = round2(result.walletBalance ?? 0);

    const entry = await this.ledgerModel.create({
      userId: oid,
      type: WalletEntryType.DEBIT,
      reason: input.reason,
      amount,
      balanceAfter: balance,
      note: input.note,
      orderId: input.orderId ? new Types.ObjectId(input.orderId) : undefined,
    });
    return { entry: this.toEntry(entry), balance };
  }

  /**
   * Credit a user's wallet. Used for refunds, cashbacks, signup
   * bonuses, and admin adjustments.
   */
  async credit(input: CreditInput): Promise<{ entry: WalletEntry; balance: number }> {
    const amount = round2(input.amount);
    if (amount <= 0) throw new BadRequestException('Amount must be positive');

    const oid = new Types.ObjectId(input.userId);
    const result = await this.userModel
      .findByIdAndUpdate(
        oid,
        { $inc: { walletBalance: amount } },
        { new: true, projection: { walletBalance: 1 } },
      )
      .exec();
    if (!result) throw new NotFoundException('User not found');
    const balance = round2(result.walletBalance ?? 0);

    const entry = await this.ledgerModel.create({
      userId: oid,
      type: input.type ?? WalletEntryType.CREDIT,
      reason: input.reason,
      amount,
      balanceAfter: balance,
      note: input.note,
      orderId: input.orderId ? new Types.ObjectId(input.orderId) : undefined,
    });
    return { entry: this.toEntry(entry), balance };
  }

  private toEntry(r: WalletLedgerDocument): WalletEntry {
    return {
      id: r._id.toString(),
      type: r.type,
      reason: r.reason,
      amount: round2(r.amount),
      balanceAfter: round2(r.balanceAfter),
      note: r.note,
      orderId: r.orderId?.toString(),
      createdAt: (r as unknown as { createdAt: Date }).createdAt,
    };
  }
}
