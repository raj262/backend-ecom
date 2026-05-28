import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SupportTicketDocument = HydratedDocument<SupportTicket>;

export enum SupportTicketStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

@Schema({ timestamps: true, versionKey: false })
export class SupportTicket {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  subject!: string;

  @Prop({ required: true, trim: true })
  message!: string;

  @Prop({ default: 'general', trim: true })
  category!: string;

  @Prop({
    type: String,
    enum: Object.values(SupportTicketStatus),
    default: SupportTicketStatus.OPEN,
    index: true,
  })
  status!: SupportTicketStatus;

  @Prop({ type: [String], default: [] })
  tags!: string[];
}

export const SupportTicketSchema = SchemaFactory.createForClass(SupportTicket);
