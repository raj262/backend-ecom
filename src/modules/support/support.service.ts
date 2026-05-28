import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateSupportTicketDto } from './dto/create-ticket.dto';
import {
  SupportTicket,
  SupportTicketDocument,
  SupportTicketStatus,
} from './schemas/support-ticket.schema';

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

const FAQ: FaqItem[] = [
  {
    id: 'orders-track',
    category: 'Orders',
    question: 'How do I track my order?',
    answer:
      'Open Orders from your profile. Each order shows a live timeline from payment to delivery, plus a carrier tracking link when shipped.',
  },
  {
    id: 'returns',
    category: 'Returns',
    question: 'What is your return policy?',
    answer:
      'Most items can be returned within 14 days of delivery if unworn and with tags. Start a return from the order detail screen.',
  },
  {
    id: 'payments',
    category: 'Payments',
    question: 'Which payment methods do you accept?',
    answer:
      'We accept UPI, cards, net banking, COD (where available), and your Lumière wallet balance at checkout.',
  },
  {
    id: 'wallet',
    category: 'Wallet',
    question: 'How do Lumière Coins work?',
    answer:
      'Coins are store credit in your wallet. Earn them via referrals, cashback campaigns, and promotions — redeem at checkout.',
  },
  {
    id: 'referral',
    category: 'Loyalty',
    question: 'How does the referral program work?',
    answer:
      'Share your code from the Rewards screen. When a friend signs up and applies it, you both receive wallet credit.',
  },
];

@Injectable()
export class SupportService {
  constructor(
    @InjectModel(SupportTicket.name)
    private readonly ticketModel: Model<SupportTicketDocument>,
  ) {}

  listFaq(): FaqItem[] {
    return FAQ;
  }

  async createTicket(userId: string, dto: CreateSupportTicketDto) {
    const doc = await this.ticketModel.create({
      userId: new Types.ObjectId(userId),
      subject: dto.subject.trim(),
      message: dto.message.trim(),
      category: dto.category?.trim() || 'general',
      status: SupportTicketStatus.OPEN,
    });
    return this.serialize(doc);
  }

  async listMyTickets(userId: string) {
    const rows = await this.ticketModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();
    return rows.map((r) => this.serialize(r));
  }

  private serialize(doc: SupportTicketDocument) {
    const row = doc.toObject() as SupportTicketDocument & {
      createdAt?: Date;
      updatedAt?: Date;
    };
    return {
      id: doc._id.toString(),
      subject: row.subject,
      message: row.message,
      category: row.category,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
