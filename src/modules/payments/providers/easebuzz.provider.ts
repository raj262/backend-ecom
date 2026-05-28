import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { IntegrationKey } from '../../integrations/schemas/integration.schema';
import { IntegrationsService } from '../../integrations/services/integrations.service';
import {
  PaymentInitRequest,
  PaymentInitResponse,
  PaymentProviderAdapter,
  PaymentVerifyRequest,
} from './payment-provider.interface';

/**
 * Easebuzz uses an SHA-512 hash of pipe-joined fields for both request
 * signing and response verification:
 *
 *   request : key|txnid|amount|productinfo|firstname|email|...|salt
 *   response: salt|status|...|email|firstname|productinfo|amount|txnid|key
 *
 * Reverse-engineer either string and digest it — both endpoints look at the
 * same SHA-512 hex.
 */
@Injectable()
export class EasebuzzProvider implements PaymentProviderAdapter {
  readonly name = 'easebuzz';
  private readonly logger = new Logger(EasebuzzProvider.name);

  constructor(
    private readonly config: ConfigService,
    private readonly integrations: IntegrationsService,
  ) {}

  private async credentials(): Promise<{ key: string; salt: string; env: string }> {
    const active = await this.integrations.resolveActive(IntegrationKey.PAYMENT);
    if (active && active.provider === 'easebuzz') {
      return {
        key: active.publicConfig.key ?? '',
        salt: active.credentials.salt ?? '',
        env: active.publicConfig.env ?? 'test',
      };
    }
    return {
      key: this.config.get<string>('EASEBUZZ_KEY') ?? '',
      salt: this.config.get<string>('EASEBUZZ_SALT') ?? '',
      env: this.config.get<string>('EASEBUZZ_ENV') ?? 'test',
    };
  }

  async init(req: PaymentInitRequest): Promise<PaymentInitResponse> {
    const txnid = `LUM${req.orderId.slice(-10)}_${Date.now()}`;
    const { key, salt } = await this.credentials();
    if (!key || !salt) {
      this.logger.warn('Easebuzz creds missing — returning mock access key');
      return {
        providerRef: txnid,
        clientPayload: {
          access_key: `access_dev_${txnid}`,
          env: 'test',
          amount: req.amount,
          txnid,
        },
      };
    }
    // Real init posts to /payment/initiateLink with the SHA-512 hash.
    // Implementation deferred until creds are wired.
    throw new Error('Easebuzz integration not finalised — set EASEBUZZ_KEY and wire fetch');
  }

  async verify(req: PaymentVerifyRequest): Promise<boolean> {
    const { key, salt } = await this.credentials();
    if (!salt) {
      this.logger.warn('Easebuzz verify in dev (no salt set) → trusting client');
      return true;
    }
    const { fields, signature } = req;
    const expected = createHash('sha512')
      .update(
        [
          salt,
          fields.status,
          fields.udf5 ?? '',
          fields.udf4 ?? '',
          fields.udf3 ?? '',
          fields.udf2 ?? '',
          fields.udf1 ?? '',
          fields.email,
          fields.firstname,
          fields.productinfo,
          fields.amount,
          fields.txnid,
          key,
        ].join('|'),
      )
      .digest('hex');
    return expected === signature;
  }
}
