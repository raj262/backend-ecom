import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CategoryDocument = HydratedDocument<Category>;

@Schema({ timestamps: true, versionKey: false })
export class Category {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true })
  slug!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop()
  image?: string;

  /** Optional self-reference for sub-categories. */
  @Prop({ type: Types.ObjectId, ref: 'Category', default: null, index: true })
  parentId!: Types.ObjectId | null;

  @Prop({ default: 0 }) order!: number;
  @Prop({ default: true, index: true }) active!: boolean;
}

export const CategorySchema = SchemaFactory.createForClass(Category);
