import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { IntegrationKey } from '../../integrations/schemas/integration.schema';
import { IntegrationsService } from '../../integrations/services/integrations.service';
import {
  PaymentInitRequest,
  PaymentInitResponse,
  PaymentProviderAdapter,
  PaymentVerifyRequest,
} from './payment-provider.interface';

/**
 * Razorpay Checkout integration.
 *
 * Flow:
 *   1. Backend creates Razorpay Order → returns providerRef + key to client
 *   2. Client opens Checkout, gets `razorpay_payment_id` + `razorpay_signature`
 *   3. Client POSTs those back → we verify the HMAC-SHA256 here
 *
 * NEVER trust step 2's "success" callback without step 3.
 *
 * For now `init` returns a deterministic mock id when credentials are missing
 * so dev can flow end-to-end. Drop in the real Razorpay SDK call when keys
 * are configured.
 */
@Injectable()
export class RazorpayProvider implements PaymentProviderAdapter {
  readonly name = 'razorpay';
  private readonly logger = new Logger(RazorpayProvider.name);

  constructor(
    private readonly config: ConfigService,
    private readonly integrations: IntegrationsService,
  ) {}

  /**
   * Resolve credentials. Order:
   *   1. The active integration row (admin-managed, encrypted)
   *   2. `.env` (legacy / CI / first-boot fallback)
   */
  private async credentials(): Promise<{ keyId: string; keySecret: string }> {
    const active = await this.integrations.resolveActive(IntegrationKey.PAYMENT);
    if (active && active.provider === 'razorpay') {
      return {
        keyId: active.publicConfig.keyId ?? '',
        keySecret: active.credentials.keySecret ?? '',
      };
    }
    return {
      keyId: this.config.get<string>('RAZORPAY_KEY_ID') ?? '',
      keySecret: this.config.get<string>('RAZORPAY_KEY_SECRET') ?? '',
    };
  }

  async init(req: PaymentInitRequest): Promise<PaymentInitResponse> {
    const { keyId, keySecret } = await this.credentials();
    if (!keyId || !keySecret) {
      this.logger.warn('Razorpay creds missing — returning mock order id');
      const providerRef = `order_dev_${req.orderId.slice(-8)}`;
      return {
        providerRef,
        clientPayload: {
          key: 'rzp_test_dev',
          amount: Math.round(req.amount * 100),
          currency: req.currency,
          name: 'Lumière',
          order_id: providerRef,
          prefill: req.customer,
        },
      };
    }
    // Real call would be:
    //   const order = await razorpay.orders.create({ amount: amount*100, ... })
    //   return { providerRef: order.id, clientPayload: { key: keyId, ...order } }
    // Omitted here to avoid adding the npm dep until the user wires keys.
    throw new Error('Razorpay SDK not yet integrated — set RAZORPAY_KEY_ID and wire SDK call');
  }

  async verify(req: PaymentVerifyRequest): Promise<boolean> {
    const { keySecret } = await this.credentials();
    if (!keySecret) {
      // Dev mode: accept anything so checkout completes end-to-end.
      this.logger.warn('Razorpay verify in dev (no secret set) → trusting client');
      return true;
    }
    const { providerRef, fields, signature } = req;
    const paymentId = fields.razorpay_payment_id;
    if (!paymentId) return false;
    const expected = createHmac('sha256', keySecret)
      .update(`${providerRef}|${paymentId}`)
      .digest('hex');
    return safeEqual(expected, signature);
  }
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
