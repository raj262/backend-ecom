import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { invoiceNumber } from '../../../utils/ids';
import { QueueService } from '../../../queues/queue.service';
import { Order, OrderDocument } from '../schemas/order.schema';

export interface GenerateInvoicePayload {
  orderId: string;
}

/**
 * Owns invoice generation. Today it persists `{number, issuedAt, pdfUrl?}`
 * onto the order; producing the actual PDF and uploading it to S3 is
 * left as the next swap-in — the queue boundary is what matters.
 *
 * Always invoked asynchronously: `OrdersService.markPaid` enqueues an
 * `invoice.generate` job, and BullMQ (or the inline fallback) calls
 * `OrderInvoiceService.run` here.
 */
@Injectable()
export class OrderInvoiceService implements OnModuleInit {
  private readonly logger = new Logger(OrderInvoiceService.name);

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    private readonly queue: QueueService,
  ) {}

  onModuleInit() {
    this.queue.register<GenerateInvoicePayload>('invoice.generate', (p) =>
      this.run(p),
    );
  }

  async run({ orderId }: GenerateInvoicePayload): Promise<void> {
    if (!Types.ObjectId.isValid(orderId)) {
      throw new NotFoundException(`Invalid order id: ${orderId}`);
    }
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    if (order.invoice?.number) {
      this.logger.debug(
        `Invoice already exists for ${order.orderNumber} → skipping`,
      );
      return;
    }
    order.invoice = {
      number: invoiceNumber(),
      issuedAt: new Date(),
    };
    await order.save();
    this.logger.log(
      `Issued invoice ${order.invoice.number} for ${order.orderNumber}`,
    );
  }
}
