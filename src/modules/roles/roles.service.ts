import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SCOPES } from '../../common/types/scopes';
import { UserRole } from '../../common/types/user-role.enum';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateRoleDto, UpdateRoleDto } from './dto/upsert-role.dto';
import { Role, RoleDocument } from './schemas/role.schema';

/** Built-in roles — kept in sync with the `UserRole` enum on boot. */
const BUILTIN_ROLES: Array<{
  key: string;
  name: string;
  description: string;
  baseRole: UserRole;
  scopes: string[];
}> = [
  {
    key: 'admin',
    name: 'Administrator',
    description: 'Full access to every admin capability.',
    baseRole: UserRole.ADMIN,
    scopes: [...SCOPES],
  },
  {
    key: 'staff',
    name: 'Staff',
    description: 'Read-only console: analytics, orders, reviews.',
    baseRole: UserRole.STAFF,
    scopes: [
      'orders:read',
      'payments:read',
      'reviews:moderate',
      'analytics:view',
      'notifications:read',
    ],
  },
  {
    key: 'vendor',
    name: 'Vendor',
    description: 'Manages own products and views their orders.',
    baseRole: UserRole.VENDOR,
    scopes: ['products:read', 'products:write', 'inventory:write'],
  },
  {
    key: 'courier',
    name: 'Courier',
    description: 'Last-mile delivery — claim and complete assigned runs.',
    baseRole: UserRole.COURIER,
    scopes: ['orders:read'],
  },
  {
    key: 'customer',
    name: 'Customer',
    description: 'Default storefront role.',
    baseRole: UserRole.CUSTOMER,
    scopes: [],
  },
];

@Injectable()
export class RolesService implements OnModuleInit {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    @InjectModel(Role.name) private readonly roleModel: Model<RoleDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  /** Seed (and keep up-to-date) the 4 built-in roles on every boot. */
  async onModuleInit() {
    for (const r of BUILTIN_ROLES) {
      await this.roleModel.updateOne(
        { key: r.key },
        {
          $set: {
            name: r.name,
            description: r.description,
            baseRole: r.baseRole,
            scopes: r.scopes,
            builtin: true,
            active: true,
          },
        },
        { upsert: true },
      );
    }
    this.logger.log(`Built-in roles synced (${BUILTIN_ROLES.length}).`);
  }

  list() {
    return this.roleModel.find().sort({ builtin: -1, name: 1 }).exec();
  }

  async create(dto: CreateRoleDto): Promise<RoleDocument> {
    if (BUILTIN_ROLES.some((b) => b.key === dto.key)) {
      throw new ConflictException(
        `"${dto.key}" is a built-in role and cannot be redefined`,
      );
    }
    const existing = await this.roleModel.findOne({ key: dto.key }).exec();
    if (existing) {
      throw new ConflictException(`Role "${dto.key}" already exists`);
    }
    return this.roleModel.create({
      key: dto.key,
      name: dto.name,
      description: dto.description ?? '',
      baseRole: dto.baseRole,
      scopes: dto.scopes ?? [],
      active: dto.active ?? true,
      builtin: false,
    });
  }

  async update(key: string, dto: UpdateRoleDto): Promise<RoleDocument> {
    const role = await this.requireRole(key);
    if (role.builtin) {
      throw new ForbiddenException(
        `Built-in role "${key}" cannot be modified`,
      );
    }
    Object.assign(role, dto);
    await role.save();
    return role;
  }

  async remove(key: string): Promise<void> {
    const role = await this.requireRole(key);
    if (role.builtin) {
      throw new ForbiddenException(
        `Built-in role "${key}" cannot be deleted`,
      );
    }
    const assignedCount = await this.userModel
      .countDocuments({ customRoleKey: key })
      .exec();
    if (assignedCount > 0) {
      throw new BadRequestException(
        `Role "${key}" is assigned to ${assignedCount} user${assignedCount === 1 ? '' : 's'}. Reassign them before deleting.`,
      );
    }
    await this.roleModel.deleteOne({ _id: role._id }).exec();
  }

  /** Used by UsersService when assigning a custom role to a user. */
  async findByKey(key: string): Promise<RoleDocument | null> {
    return this.roleModel.findOne({ key, active: true }).exec();
  }

  private async requireRole(key: string): Promise<RoleDocument> {
    const role = await this.roleModel.findOne({ key }).exec();
    if (!role) throw new NotFoundException(`Role "${key}" not found`);
    return role;
  }
}
