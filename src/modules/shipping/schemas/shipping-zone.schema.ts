import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ShippingZoneDocument = HydratedDocument<ShippingZone>;

/**
 * Geographic bucket used to look up applicable shipping methods at checkout.
 * Match precedence: postal-code prefix → city → state → country fallback.
 */
@Schema({ timestamps: true })
export class ShippingZone {
  @Prop({ required: true, unique: true, index: true })
  code!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ type: [String], default: ['IN'] })
  countries!: string[];

  @Prop({ type: [String], default: [] })
  states!: string[];

  @Prop({ type: [String], default: [] })
  cities!: string[];

  /** e.g. ["110", "560"] matches Delhi / Bangalore PIN prefixes. */
  @Prop({ type: [String], default: [] })
  postalPrefixes!: string[];

  /** Method codes (from `ShippingMethod.code`) that ship to this zone. */
  @Prop({ type: [String], default: [] })
  methodCodes!: string[];

  @Prop({ default: true, index: true })
  active!: boolean;
}

export const ShippingZoneSchema = SchemaFactory.createForClass(ShippingZone);
