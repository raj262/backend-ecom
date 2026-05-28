import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WalletLedgerDocument = HydratedDocument<WalletLedger>;

export enum WalletEntryType {
  CREDIT = 'credit',
  DEBIT = 'debit',
  REFUND = 'refund',
}

export enum WalletEntryReason {
  ORDER_PAYMENT = 'order_payment',
  ORDER_REFUND = 'order_refund',
  REFERRAL = 'referral',
  SIGNUP_BONUS = 'signup_bonus',
  ADMIN_ADJUSTMENT = 'admin_adjustment',
  CASHBACK = 'cashback',
}

/**
 * Append-only ledger of every wallet movement. Lets a customer view
 * their full transaction history and lets ops reconcile balances
 * (sum of credits − sum of debits == user.walletBalance).
 */
@Schema({ timestamps: { createdAt: true, updatedAt: false }, versionKey: false })
export class WalletLedger {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(WalletEntryType) })
  type!: WalletEntryType;

  @Prop({ required: true, enum: Object.values(WalletEntryReason) })
  reason!: WalletEntryReason;

  /** Always positive — sign is implicit in `type`. */
  @Prop({ required: true, min: 0 })
  amount!: number;

  /** Balance immediately *after* this entry was applied. */
  @Prop({ required: true, min: 0 })
  balanceAfter!: number;

  @Prop() note?: string;
  @Prop({ type: Types.ObjectId, ref: 'Order' }) orderId?: Types.ObjectId;
}

export const WalletLedgerSchema = SchemaFactory.createForClass(WalletLedger);
WalletLedgerSchema.index({ userId: 1, createdAt: -1 });
