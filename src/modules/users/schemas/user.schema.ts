import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { UserRole } from '../../../common/types/user-role.enum';

export type UserDocument = HydratedDocument<User>;

/**
 * Stored as a sub-document with its own `_id` so a per-address picker
 * on mobile can reference + edit a specific entry without re-sending
 * the whole list. The `_id` is generated server-side and serialised
 * as `id` in the public projection.
 */
@Schema()
export class Address {
  @Prop() label?: string;
  @Prop() fullName?: string;
  @Prop() line1?: string;
  @Prop() line2?: string;
  @Prop() city?: string;
  @Prop() state?: string;
  @Prop() country?: string;
  @Prop() zip?: string;
  @Prop() phone?: string;
  /** Used by the invoice service to decide CGST+SGST vs IGST. */
  @Prop() gstin?: string;
  @Prop({ default: false }) isDefault?: boolean;
}

export const AddressSchema = SchemaFactory.createForClass(Address);

export enum SavedPaymentType {
  CARD = 'card',
  UPI = 'upi',
  WALLET = 'wallet',
  NETBANKING = 'netbanking',
}

/**
 * Tokenised payment instrument the user has chosen to remember. We
 * NEVER store full PAN / CVV / UPI MPIN here — those live with the
 * upstream PSP (Razorpay, Stripe, …). What's kept is the PSP's
 * customer/instrument id plus the masked display fields needed to
 * render a "Pay with •••• 4242" row.
 */
@Schema({ timestamps: true })
export class SavedPaymentMethod {
  @Prop({ type: String, enum: Object.values(SavedPaymentType), required: true })
  type!: SavedPaymentType;

  /** Card BIN brand (visa / mastercard / rupay), UPI handle, etc. */
  @Prop() label?: string;

  /** Last four digits of the card OR the UPI VPA (e.g. `name@bank`). */
  @Prop() display?: string;

  /** YYYY-MM card expiry — null for non-card instruments. */
  @Prop({ type: String, default: null })
  expiry?: string | null;

  /** Provider that owns the token (razorpay, stripe, …). */
  @Prop() provider?: string;

  /** Opaque token returned by the provider — used at checkout time. */
  @Prop() providerToken?: string;

  /** When true, this method is preselected on the checkout sheet. */
  @Prop({ default: false }) isDefault?: boolean;
}

export const SavedPaymentMethodSchema =
  SchemaFactory.createForClass(SavedPaymentMethod);

@Schema({ timestamps: true, versionKey: false })
export class User {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email!: string;

  /**
   * Optional now that we support OAuth and phone-OTP sign-up: a user
   * who registered via Google/Apple/phone may not have a password
   * locally until they set one. AuthService checks for presence before
   * letting `/auth/login` (password flow) succeed.
   */
  @Prop({ type: String, default: null, select: false })
  passwordHash!: string | null;

  /**
   * Legacy: per-user refresh token. Kept for migration safety but no
   * longer written to by AuthService — sessions now store the hash on
   * the `sessions` collection so we can revoke one device at a time.
   */
  @Prop({ type: String, default: null, select: false })
  refreshTokenHash!: string | null;

  @Prop({
    type: String,
    enum: Object.values(UserRole),
    default: UserRole.CUSTOMER,
    index: true,
  })
  role!: UserRole;

  /**
   * Key of a custom role (see `Role` collection). When set, the UI shows
   * the custom-role name; the underlying `role` enum continues to drive
   * `RolesGuard`. Null/missing = no custom role assigned.
   */
  @Prop({ type: String, default: null, index: true })
  customRoleKey!: string | null;

  @Prop({ default: true, index: true })
  active!: boolean;

  @Prop() avatarUrl?: string;

  /**
   * Stored in E.164 (`+91…`). Sparse-unique so multiple users without
   * a phone don't collide on `null`. Used by phone-OTP login.
   */
  @Prop({ type: String, default: null, index: true })
  phone?: string | null;

  @Prop({ default: false })
  phoneVerified!: boolean;

  @Prop({ default: false })
  emailVerified!: boolean;

  /** Google `sub` claim — sparse-unique. */
  @Prop({ type: String, default: null, index: true })
  googleId?: string | null;

  /** Apple `sub` claim — sparse-unique. */
  @Prop({ type: String, default: null, index: true })
  appleId?: string | null;

  @Prop({ type: [AddressSchema], default: [] })
  addresses!: Address[];

  /**
   * Lumière wallet balance — non-negative integer cents (… well,
   * non-negative ₹ to two decimals). Treat as cash: any credit/debit
   * MUST go through `WalletService` so the ledger stays consistent.
   */
  @Prop({ default: 0, min: 0 })
  walletBalance!: number;

  /** Shareable referral code — generated lazily by `LoyaltyService`. */
  @Prop({ type: String, default: null, index: true })
  referralCode!: string | null;

  /** Set once when the user applies someone else's referral code. */
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  referredBy!: Types.ObjectId | null;

  /**
   * Per-category push opt-in flags. Defaults to all-on for new accounts
   * (you can always toggle from the in-app settings screen). The
   * dispatcher consults these before fanning out — a `false` here
   * short-circuits the push for that category without touching other
   * channels (in-app, email, SMS still flow normally).
   */
  @Prop({
    type: Object,
    default: () => ({
      orderUpdates: true,
      deliveryUpdates: true,
      flashSales: true,
      cartReminders: true,
      personalizedOffers: true,
    }),
  })
  pushPreferences!: PushPreferences;

  /**
   * BCP-47-ish language tag the user picked from the in-app language
   * picker (`en`, `hi`, `mr`, `ta`, …). Falls back to `en` if unset
   * — kept short rather than a full Locale object so the column stays
   * cheap to index for future per-locale notification copy.
   */
  @Prop({ type: String, default: 'en', maxlength: 12 })
  language!: string;

  /** Optional date of birth (`YYYY-MM-DD`). Drives birthday vouchers. */
  @Prop({ type: String, default: null })
  dob?: string | null;

  /** Short public bio shown on the profile card. */
  @Prop({ type: String, default: null, maxlength: 280 })
  bio?: string | null;

  /**
   * Self-described gender for sizing / personalization. Free-form enum
   * string kept short for easy mobile picker sync.
   */
  @Prop({ type: String, default: null, maxlength: 32 })
  gender?: string | null;

  @Prop({ type: [SavedPaymentMethodSchema], default: [] })
  savedPayments!: SavedPaymentMethod[];
}

export interface PushPreferences {
  orderUpdates: boolean;
  deliveryUpdates: boolean;
  flashSales: boolean;
  cartReminders: boolean;
  personalizedOffers: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Sparse-unique indexes on the OAuth + phone identifiers. `sparse`
// matters: we don't want every password-only user colliding on `null`.
UserSchema.index({ phone: 1 }, { unique: true, sparse: true });
UserSchema.index({ googleId: 1 }, { unique: true, sparse: true });
UserSchema.index({ appleId: 1 }, { unique: true, sparse: true });
UserSchema.index({ referralCode: 1 }, { unique: true, sparse: true });
