import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { FilterQuery, Model, Types } from 'mongoose';
import { UserRole } from '../../common/types/user-role.enum';
import {
  Address,
  PushPreferences,
  SavedPaymentMethod,
  User,
  UserDocument,
} from './schemas/user.schema';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';
import {
  CreateSavedPaymentDto,
  UpdateSavedPaymentDto,
} from './dto/saved-payment.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UploadAvatarDto } from './dto/upload-avatar.dto';
import * as fs from 'fs';
import * as path from 'path';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: string;
  customRoleKey: string | null;
  active: boolean;
  avatarUrl?: string;
  phone?: string | null;
  phoneVerified: boolean;
  emailVerified: boolean;
  hasPassword: boolean;
  providers: { google: boolean; apple: boolean };
  addresses: User['addresses'];
  walletBalance: number;
  pushPreferences: PushPreferences;
  language: string;
  dob?: string | null;
  bio?: string | null;
  gender?: string | null;
  savedPayments: PublicSavedPayment[];
}

export interface PublicSavedPayment {
  id: string;
  type: 'card' | 'upi' | 'wallet' | 'netbanking';
  label?: string;
  display?: string;
  expiry?: string | null;
  provider?: string;
  isDefault: boolean;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly config: ConfigService,
  ) {}

  /** Env values come out as strings; coerce so bcrypt doesn't think the rounds is a salt. */
  private get saltRounds(): number {
    const raw = this.config.get<string>('BCRYPT_SALT_ROUNDS');
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
  }

  /** Used by AuthService.register — selects nothing sensitive. */
  async create(input: {
    name: string;
    email: string;
    passwordHash?: string | null;
    phone?: string | null;
    phoneVerified?: boolean;
    emailVerified?: boolean;
    googleId?: string | null;
    appleId?: string | null;
    avatarUrl?: string;
    /** Self-service sign-up always passes `customer`; admin uses `adminCreate`. */
    role?: UserRole;
  }): Promise<UserDocument> {
    return this.userModel.create({
      ...input,
      role: input.role ?? UserRole.CUSTOMER,
    });
  }

  findByPhoneWithSecrets(phone: string) {
    return this.userModel.findOne({ phone }).exec();
  }

  findByGoogleId(googleId: string) {
    return this.userModel.findOne({ googleId }).exec();
  }

  findByAppleId(appleId: string) {
    return this.userModel.findOne({ appleId }).exec();
  }

  findByEmail(email: string) {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async linkProviderId(
    userId: string,
    field: 'googleId' | 'appleId',
    providerId: string,
  ): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: userId },
        { $set: { [field]: providerId } },
      )
      .exec();
  }

  async markPhoneVerified(userId: string, phone: string): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: userId },
        { $set: { phone, phoneVerified: true } },
      )
      .exec();
  }

  /**
   * Admin-side user creation. Hashes the password, prevents duplicates,
   * and applies the full role + active + custom-role payload in one go.
   *
   * Lives here (not in AuthService) because `AuthService.register` is
   * tightly coupled to issuing tokens for the *self-registering* user.
   */
  async adminCreate(input: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    phone?: string;
    customRoleKey?: string | null;
    active?: boolean;
  }): Promise<UserDocument> {
    const email = input.email.toLowerCase().trim();
    const existing = await this.userModel.findOne({ email }).exec();
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }
    const passwordHash = await bcrypt.hash(input.password, this.saltRounds);
    return this.userModel.create({
      name: input.name.trim(),
      email,
      passwordHash,
      role: input.role,
      phone: input.phone,
      customRoleKey: input.customRoleKey ?? null,
      active: input.active ?? true,
    });
  }

  /** For login / refresh — explicitly pulls in hidden fields. */
  findByEmailWithSecrets(email: string) {
    return this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('+passwordHash +refreshTokenHash')
      .exec();
  }

  findById(id: string) {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.userModel.findById(id).exec();
  }

  findByIdWithRefresh(id: string) {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.userModel.findById(id).select('+refreshTokenHash').exec();
  }

  async setRefreshTokenHash(userId: string, hash: string | null): Promise<void> {
    await this.userModel
      .updateOne({ _id: userId }, { $set: { refreshTokenHash: hash } })
      .exec();
  }

  async update(userId: string, patch: UpdateUserDto): Promise<UserDocument> {
    // If the user is changing their email we re-check uniqueness so a
    // clash surfaces as a 409 rather than a cryptic Mongo dup-key error.
    if (patch.email) {
      const conflict = await this.userModel
        .findOne({ email: patch.email.toLowerCase(), _id: { $ne: userId } })
        .select('_id')
        .exec();
      if (conflict) {
        throw new ConflictException('That email is already in use.');
      }
    }
    // Phone must be unique too — sparse index allows null but we
    // surface the conflict eagerly with a friendly error.
    if (patch.phone) {
      const conflict = await this.userModel
        .findOne({ phone: patch.phone, _id: { $ne: userId } })
        .select('_id')
        .exec();
      if (conflict) {
        throw new ConflictException('That phone number is already in use.');
      }
    }

    // Build the $set explicitly so we can lowercase the email and
    // strip null/undefined keys.
    const $set: Record<string, unknown> = {};
    if (patch.name !== undefined) $set.name = patch.name;
    if (patch.email !== undefined) $set.email = patch.email.toLowerCase();
    if (patch.phone !== undefined) $set.phone = patch.phone;
    if (patch.avatarUrl !== undefined) $set.avatarUrl = patch.avatarUrl;
    if (patch.dob !== undefined) $set.dob = patch.dob;
    if (patch.bio !== undefined) {
      $set.bio = patch.bio.trim() ? patch.bio.trim() : null;
    }
    if (patch.gender !== undefined) {
      $set.gender = patch.gender || null;
    }
    if (patch.language !== undefined) $set.language = patch.language;
    if (patch.addresses !== undefined) $set.addresses = patch.addresses;

    // Changing the email or phone resets the verified flag — it's not
    // verified for the new value yet.
    if (patch.email !== undefined) $set.emailVerified = false;
    if (patch.phone !== undefined) $set.phoneVerified = false;

    const user = await this.userModel
      .findByIdAndUpdate(userId, { $set }, { new: true })
      .exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async uploadAvatar(
    userId: string,
    dto: UploadAvatarDto,
  ): Promise<PublicUser> {
    const mime = dto.mimeType ?? 'image/jpeg';
    const ext =
      mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    let buffer: Buffer;
    try {
      buffer = Buffer.from(dto.imageBase64, 'base64');
    } catch {
      throw new BadRequestException('Invalid image data');
    }
    if (buffer.length < 64 || buffer.length > 3 * 1024 * 1024) {
      throw new BadRequestException('Image must be between 64 bytes and 3 MB');
    }

    const uploadsRoot = path.join(process.cwd(), 'uploads', 'avatars');
    await fs.promises.mkdir(uploadsRoot, { recursive: true });
    const filename = `${userId}.${ext}`;
    await fs.promises.writeFile(path.join(uploadsRoot, filename), buffer);

    const port = this.config.get<number>('PORT', 4000);
    const publicBase = (
      this.config.get<string>('PUBLIC_URL') ?? `http://localhost:${port}`
    ).replace(/\/$/, '');
    const avatarUrl = `${publicBase}/uploads/avatars/${filename}?v=${Date.now()}`;

    const user = await this.userModel
      .findByIdAndUpdate(userId, { $set: { avatarUrl } }, { new: true })
      .exec();
    if (!user) throw new NotFoundException('User not found');
    return this.toPublic(user);
  }

  async clearAvatar(userId: string): Promise<PublicUser> {
    const user = await this.userModel
      .findByIdAndUpdate(userId, { $set: { avatarUrl: null } }, { new: true })
      .exec();
    if (!user) throw new NotFoundException('User not found');
    return this.toPublic(user);
  }

  // --- Saved payment methods -----------------------------------------

  async listSavedPayments(userId: string): Promise<SavedPaymentMethod[]> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');
    return user.savedPayments ?? [];
  }

  async addSavedPayment(
    userId: string,
    dto: CreateSavedPaymentDto,
  ): Promise<SavedPaymentMethod[]> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');
    const makeDefault =
      !!dto.isDefault || (user.savedPayments?.length ?? 0) === 0;
    if (makeDefault) {
      user.savedPayments.forEach((p) => {
        p.isDefault = false;
      });
    }
    user.savedPayments.push({
      ...dto,
      isDefault: makeDefault,
    } as SavedPaymentMethod);
    await user.save();
    return user.savedPayments;
  }

  async updateSavedPayment(
    userId: string,
    methodId: string,
    dto: UpdateSavedPaymentDto,
  ): Promise<SavedPaymentMethod[]> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');
    const target = user.savedPayments.find(
      (p: SavedPaymentMethod & { _id?: Types.ObjectId }) =>
        p._id?.toString() === methodId,
    );
    if (!target) throw new NotFoundException('Payment method not found');
    Object.assign(target, dto);
    if (dto.isDefault) {
      user.savedPayments.forEach(
        (p: SavedPaymentMethod & { _id?: Types.ObjectId }) => {
          p.isDefault = p._id?.toString() === methodId;
        },
      );
    }
    await user.save();
    return user.savedPayments;
  }

  async removeSavedPayment(
    userId: string,
    methodId: string,
  ): Promise<SavedPaymentMethod[]> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');
    const before = user.savedPayments.length;
    user.savedPayments = user.savedPayments.filter(
      (p: SavedPaymentMethod & { _id?: Types.ObjectId }) =>
        p._id?.toString() !== methodId,
    ) as typeof user.savedPayments;
    if (user.savedPayments.length === before) {
      throw new NotFoundException('Payment method not found');
    }
    if (
      user.savedPayments.length > 0 &&
      !user.savedPayments.some((p) => p.isDefault)
    ) {
      user.savedPayments[0].isDefault = true;
    }
    await user.save();
    return user.savedPayments;
  }

  async setDefaultSavedPayment(
    userId: string,
    methodId: string,
  ): Promise<SavedPaymentMethod[]> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');
    let found = false;
    user.savedPayments.forEach(
      (p: SavedPaymentMethod & { _id?: Types.ObjectId }) => {
        const isThis = p._id?.toString() === methodId;
        p.isDefault = isThis;
        if (isThis) found = true;
      },
    );
    if (!found) throw new NotFoundException('Payment method not found');
    await user.save();
    return user.savedPayments;
  }

  // --- Address book ---------------------------------------------------

  async listAddresses(userId: string): Promise<Address[]> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');
    return user.addresses ?? [];
  }

  /**
   * Add an address. If `isDefault` is set (or this is the first
   * address) the previous default is demoted in the same write.
   */
  async addAddress(userId: string, dto: CreateAddressDto): Promise<Address[]> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');

    const makeDefault = !!dto.isDefault || (user.addresses?.length ?? 0) === 0;
    if (makeDefault && user.addresses) {
      user.addresses.forEach((a) => {
        a.isDefault = false;
      });
    }
    user.addresses.push({ ...dto, isDefault: makeDefault } as Address);
    await user.save();
    return user.addresses;
  }

  async updateAddress(
    userId: string,
    addressId: string,
    dto: UpdateAddressDto,
  ): Promise<Address[]> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');
    const target = user.addresses.find(
      (a: Address & { _id?: Types.ObjectId }) =>
        a._id?.toString() === addressId,
    );
    if (!target) throw new NotFoundException('Address not found');

    Object.assign(target, dto);

    if (dto.isDefault) {
      user.addresses.forEach((a: Address & { _id?: Types.ObjectId }) => {
        a.isDefault = a._id?.toString() === addressId;
      });
    }
    await user.save();
    return user.addresses;
  }

  async removeAddress(userId: string, addressId: string): Promise<Address[]> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');
    const before = user.addresses.length;
    user.addresses = user.addresses.filter(
      (a: Address & { _id?: Types.ObjectId }) =>
        a._id?.toString() !== addressId,
    ) as typeof user.addresses;
    if (user.addresses.length === before) {
      throw new NotFoundException('Address not found');
    }
    // If we just removed the default, promote the newest remaining.
    if (
      user.addresses.length > 0 &&
      !user.addresses.some((a) => a.isDefault)
    ) {
      user.addresses[0].isDefault = true;
    }
    await user.save();
    return user.addresses;
  }

  async setDefaultAddress(
    userId: string,
    addressId: string,
  ): Promise<Address[]> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');
    const found = user.addresses.some(
      (a: Address & { _id?: Types.ObjectId }) =>
        a._id?.toString() === addressId,
    );
    if (!found) throw new NotFoundException('Address not found');
    user.addresses.forEach((a: Address & { _id?: Types.ObjectId }) => {
      a.isDefault = a._id?.toString() === addressId;
    });
    await user.save();
    return user.addresses;
  }

  // --- Admin helpers --------------------------------------------------

  async paginate(opts: {
    page: number;
    limit: number;
    role?: UserRole;
    q?: string;
  }) {
    const { page, limit, role, q } = opts;
    const filter: FilterQuery<UserDocument> = {};
    if (role) filter.role = role;
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.userModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.userModel.countDocuments(filter).exec(),
    ]);
    return {
      items: items.map((u) => this.toPublic(u)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Change a user's role and (optionally) attach a custom-role key.
   * `actorId` is the admin doing the change — used to block
   * self-demotion (admins removing their own admin role would lock
   * themselves out).
   *
   * Passing `customRoleKey: null` explicitly clears any existing custom
   * role; passing `undefined` leaves it untouched.
   */
  async setRole(
    actorId: string,
    userId: string,
    role: UserRole,
    customRoleKey?: string | null,
  ): Promise<UserDocument> {
    if (actorId === userId && role !== UserRole.ADMIN) {
      throw new ForbiddenException('You cannot demote yourself');
    }
    const update: Record<string, unknown> = { role };
    if (customRoleKey !== undefined) update.customRoleKey = customRoleKey;
    const user = await this.userModel
      .findByIdAndUpdate(userId, { $set: update }, { new: true })
      .exec();
    if (!user) throw new NotFoundException('User not found');
    // Force re-login on role change by invalidating any active refresh token.
    await this.setRefreshTokenHash(userId, null);
    return user;
  }

  /**
   * Activate / deactivate an account. Blocks self-deactivation for the
   * same reason as above.
   */
  async setActive(
    actorId: string,
    userId: string,
    active: boolean,
  ): Promise<UserDocument> {
    if (actorId === userId && !active) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }
    const user = await this.userModel
      .findByIdAndUpdate(userId, { $set: { active } }, { new: true })
      .exec();
    if (!user) throw new NotFoundException('User not found');
    if (!active) await this.setRefreshTokenHash(userId, null);
    return user;
  }

  toPublic(user: UserDocument): PublicUser {
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      customRoleKey: user.customRoleKey ?? null,
      active: user.active ?? true,
      avatarUrl: user.avatarUrl,
      phone: user.phone ?? null,
      phoneVerified: !!user.phoneVerified,
      emailVerified: !!user.emailVerified,
      // `passwordHash` is `select:false`, so when we don't pull it
      // explicitly the field is undefined — coerce to "false" so the
      // mobile app shows the "set a password" CTA for OAuth-only users
      // without misleading them.
      hasPassword: typeof user.passwordHash === 'string' && user.passwordHash.length > 0,
      providers: {
        google: !!user.googleId,
        apple: !!user.appleId,
      },
      addresses: user.addresses,
      walletBalance: user.walletBalance ?? 0,
      pushPreferences: user.pushPreferences ?? {
        orderUpdates: true,
        deliveryUpdates: true,
        flashSales: true,
        cartReminders: true,
        personalizedOffers: true,
      },
      language: user.language ?? 'en',
      bio: user.bio ?? null,
      gender: user.gender ?? null,
      dob: user.dob ?? null,
      savedPayments: (user.savedPayments ?? []).map(
        (p: SavedPaymentMethod & { _id?: Types.ObjectId }): PublicSavedPayment => ({
          id: p._id?.toString() ?? '',
          type: p.type,
          label: p.label,
          display: p.display,
          expiry: p.expiry ?? null,
          provider: p.provider,
          isDefault: !!p.isDefault,
        }),
      ),
    };
  }

  /** Used by the notifications module when the customer toggles a category. */
  async updatePushPreferences(
    userId: string,
    patch: Partial<PushPreferences>,
  ): Promise<UserDocument> {
    const $set: Record<string, unknown> = {};
    (Object.keys(patch) as Array<keyof PushPreferences>).forEach((k) => {
      const v = patch[k];
      if (typeof v === 'boolean') $set[`pushPreferences.${k}`] = v;
    });
    const user = await this.userModel
      .findByIdAndUpdate(userId, { $set }, { new: true })
      .exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
