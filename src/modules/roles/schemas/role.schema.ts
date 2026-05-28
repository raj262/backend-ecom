import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { SCOPES } from '../../../common/types/scopes';
import { UserRole } from '../../../common/types/user-role.enum';

export type RoleDocument = HydratedDocument<Role>;

/**
 * A role record represents either a **built-in** role (mirrors the
 * `UserRole` enum, `builtin: true`, immutable) or a **custom** role
 * defined by an admin at runtime.
 *
 * Custom roles always inherit one of the built-in tiers (`baseRole`) so
 * runtime enforcement still works through the existing `RolesGuard`.
 * The `scopes` array documents extra capabilities — surfaced in the UI
 * and reserved for the upcoming scope-aware guard.
 */
@Schema({ timestamps: true, versionKey: false })
export class Role {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  key!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ default: '' })
  description!: string;

  /** Which hard-coded tier this role inherits. Drives RolesGuard today. */
  @Prop({
    type: String,
    enum: Object.values(UserRole),
    required: true,
    default: UserRole.STAFF,
  })
  baseRole!: UserRole;

  @Prop({
    type: [String],
    default: [],
    validate: {
      validator(values: string[]) {
        return values.every((v) => (SCOPES as readonly string[]).includes(v));
      },
      message: 'One or more scopes are not in the SCOPES catalog',
    },
  })
  scopes!: string[];

  /** Built-in (system) role — cannot be deleted, base/scopes are managed by code. */
  @Prop({ default: false, index: true })
  builtin!: boolean;

  @Prop({ default: true, index: true })
  active!: boolean;
}

export const RoleSchema = SchemaFactory.createForClass(Role);
