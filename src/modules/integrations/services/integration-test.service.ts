import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { findProvider } from '../provider-catalog';
import {
  IntegrationKey,
  IntegrationTestStatus,
} from '../schemas/integration.schema';
import { IntegrationsService } from './integrations.service';

/**
 * Each `test()` call performs the lightest possible probe against the
 * configured provider so the admin can confirm the credentials actually
 * work *before* relying on them in production. Probes never modify
 * remote state (no test SMS, no test email, no test charges) — they
 * just validate auth.
 *
 * The exception is when the admin passes `to` (a phone number or email)
 * — then we send a real "Hello from Lumière" message, which is what
 * the user actually wants to see during setup.
 */
@Injectable()
export class IntegrationTestService {
  private readonly logger = new Logger(IntegrationTestService.name);

  constructor(private readonly integrations: IntegrationsService) {}

  async test(
    key: IntegrationKey,
    to?: string,
  ): Promise<{ status: IntegrationTestStatus; message: string }> {
    const integration = await this.integrations.getDecrypted(key);
    if (!integration) {
      return { status: IntegrationTestStatus.FAILED, message: 'Not configured' };
    }
    if (!findProvider(key, integration.provider)) {
      return {
        status: IntegrationTestStatus.FAILED,
        message: `Unknown provider "${integration.provider}"`,
      };
    }

    try {
      let result: { status: IntegrationTestStatus; message: string };
      switch (key) {
        case IntegrationKey.PAYMENT:
          result = await this.testPayment(integration.provider, integration);
          break;
        case IntegrationKey.SMS:
          result = await this.testSms(integration.provider, integration, to);
          break;
        case IntegrationKey.WHATSAPP:
          result = await this.testWhatsapp(integration.provider, integration, to);
          break;
        case IntegrationKey.MAIL:
          result = await this.testMail(integration.provider, integration, to);
          break;
        default:
          result = {
            status: IntegrationTestStatus.FAILED,
            message: `No test handler for ${key}`,
          };
      }
      await this.integrations.recordTestResult(key, result.status, result.message);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.integrations.recordTestResult(
        key,
        IntegrationTestStatus.FAILED,
        message,
      );
      this.logger.warn(`Integration test failed (${key}): ${message}`);
      return { status: IntegrationTestStatus.FAILED, message };
    }
  }

  // -------------------------------------------------------------------
  // Per-provider probes
  // -------------------------------------------------------------------

  private async testPayment(
    provider: string,
    int: { credentials: Record<string, string>; publicConfig: Record<string, string> },
  ): Promise<{ status: IntegrationTestStatus; message: string }> {
    switch (provider) {
      case 'razorpay': {
        const { keyId } = int.publicConfig;
        const { keySecret } = int.credentials;
        if (!keyId || !keySecret) {
          return missing('Razorpay key ID and secret');
        }
        // Razorpay exposes a paginated `GET /v1/orders` that requires
        // basic auth — perfect lightweight handshake.
        const res = await fetch('https://api.razorpay.com/v1/orders?count=1', {
          headers: {
            Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
          },
        });
        if (res.ok) {
          return ok('Razorpay credentials accepted.');
        }
        return fail(`Razorpay returned HTTP ${res.status}`);
      }
      case 'easebuzz': {
        const { key } = int.publicConfig;
        const { salt } = int.credentials;
        if (!key || !salt) return missing('Easebuzz key and salt');
        // Easebuzz has no cheap auth probe; verify length / format only.
        if (key.length < 4 || salt.length < 4) {
          return fail('Easebuzz key/salt look too short to be valid.');
        }
        return ok('Easebuzz credentials stored. (No live probe available.)');
      }
      case 'stripe': {
        const { publishableKey } = int.publicConfig;
        const { secretKey } = int.credentials;
        if (!publishableKey || !secretKey) return missing('Stripe keys');
        const res = await fetch('https://api.stripe.com/v1/balance', {
          headers: { Authorization: `Bearer ${secretKey}` },
        });
        if (res.ok) return ok('Stripe secret key accepted.');
        return fail(`Stripe returned HTTP ${res.status}`);
      }
      default:
        return fail(`No probe for payment provider "${provider}"`);
    }
  }

  private async testSms(
    provider: string,
    int: { credentials: Record<string, string>; publicConfig: Record<string, string> },
    to?: string,
  ): Promise<{ status: IntegrationTestStatus; message: string }> {
    switch (provider) {
      case 'twilio': {
        const { accountSid, fromNumber } = int.publicConfig;
        const { authToken } = int.credentials;
        if (!accountSid || !authToken || !fromNumber) {
          return missing('Twilio Account SID, auth token, and from number');
        }
        const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
        if (to) {
          const body = new URLSearchParams({
            From: fromNumber,
            To: to,
            Body: 'Lumière test SMS — your Twilio integration is working.',
          });
          const res = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
            {
              method: 'POST',
              headers: {
                Authorization: `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body,
            },
          );
          return res.ok
            ? ok(`Test SMS sent to ${to}.`)
            : fail(`Twilio HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        }
        // Auth probe only.
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
          { headers: { Authorization: `Basic ${auth}` } },
        );
        return res.ok
          ? ok('Twilio credentials accepted.')
          : fail(`Twilio returned HTTP ${res.status}`);
      }
      case 'msg91': {
        const { authKey } = int.credentials;
        if (!authKey) return missing('MSG91 auth key');
        // MSG91 doesn't expose a no-op auth endpoint, so we just
        // validate the auth-key format unless a recipient is given.
        if (to) {
          const res = await fetch('https://api.msg91.com/api/v5/flow/', {
            method: 'POST',
            headers: {
              authkey: authKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              mobiles: to,
              message: 'Lumière test SMS — MSG91 integration is working.',
            }),
          });
          return res.ok
            ? ok(`Test SMS sent to ${to}.`)
            : fail(`MSG91 HTTP ${res.status}`);
        }
        return ok('MSG91 credentials stored. Pass a phone number to send a real test.');
      }
      case 'vonage': {
        const { apiKey } = int.publicConfig;
        const { apiSecret } = int.credentials;
        if (!apiKey || !apiSecret) return missing('Vonage API key and secret');
        const res = await fetch(
          `https://rest.nexmo.com/account/get-balance?api_key=${apiKey}&api_secret=${apiSecret}`,
        );
        return res.ok
          ? ok('Vonage credentials accepted.')
          : fail(`Vonage returned HTTP ${res.status}`);
      }
      default:
        return fail(`No probe for SMS provider "${provider}"`);
    }
  }

  private async testWhatsapp(
    provider: string,
    int: { credentials: Record<string, string>; publicConfig: Record<string, string> },
    to?: string,
  ): Promise<{ status: IntegrationTestStatus; message: string }> {
    switch (provider) {
      case 'meta_cloud': {
        const { phoneNumberId } = int.publicConfig;
        const { accessToken } = int.credentials;
        if (!phoneNumberId || !accessToken) {
          return missing('Meta phone number ID and access token');
        }
        if (to) {
          const res = await fetch(
            `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to,
                type: 'text',
                text: { body: 'Lumière test message — WhatsApp Cloud is working.' },
              }),
            },
          );
          return res.ok
            ? ok(`Test WhatsApp sent to ${to}.`)
            : fail(`Meta HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        }
        // Probe phone-number node (returns 200 with display_phone_number).
        const res = await fetch(
          `https://graph.facebook.com/v18.0/${phoneNumberId}?fields=display_phone_number`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        return res.ok
          ? ok('Meta WhatsApp credentials accepted.')
          : fail(`Meta returned HTTP ${res.status}`);
      }
      case 'twilio_wa': {
        const { accountSid, fromNumber } = int.publicConfig;
        const { authToken } = int.credentials;
        if (!accountSid || !authToken || !fromNumber) {
          return missing('Twilio WhatsApp SID, token, and from number');
        }
        const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
        if (to) {
          const target = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
          const body = new URLSearchParams({
            From: fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`,
            To: target,
            Body: 'Lumière test message — Twilio WhatsApp is working.',
          });
          const res = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
            {
              method: 'POST',
              headers: {
                Authorization: `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body,
            },
          );
          return res.ok
            ? ok(`Test WhatsApp sent to ${to}.`)
            : fail(`Twilio HTTP ${res.status}`);
        }
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
          { headers: { Authorization: `Basic ${auth}` } },
        );
        return res.ok
          ? ok('Twilio WhatsApp credentials accepted.')
          : fail(`Twilio returned HTTP ${res.status}`);
      }
      default:
        return fail(`No probe for WhatsApp provider "${provider}"`);
    }
  }

  private async testMail(
    provider: string,
    int: { credentials: Record<string, string>; publicConfig: Record<string, string> },
    to?: string,
  ): Promise<{ status: IntegrationTestStatus; message: string }> {
    // We resolve nodemailer lazily so dev environments that don't install
    // optional deps still boot.
    let nodemailer: typeof import('nodemailer');
    try {
      nodemailer = await import('nodemailer');
    } catch {
      throw new BadRequestException(
        'nodemailer is not installed. Run `npm install nodemailer` in /backend.',
      );
    }

    switch (provider) {
      case 'gmail':
      case 'outlook':
      case 'smtp': {
        const { host, port, secure, user, fromEmail, fromName } =
          int.publicConfig as Record<string, string>;
        const { pass } = int.credentials;
        if (!host || !port || !user || !pass || !fromEmail) {
          return missing('SMTP host, port, user, password and from-email');
        }
        const transport = nodemailer.createTransport({
          host,
          port: Number(port),
          secure: secure === 'true' || port === '465',
          auth: { user, pass },
        });
        await transport.verify();
        if (to) {
          await transport.sendMail({
            from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
            to,
            subject: 'Lumière test email',
            text: 'Your SMTP integration is working end-to-end.',
            html: '<p>Your SMTP integration is working end-to-end.</p>',
          });
          return ok(`Test email sent to ${to}.`);
        }
        return ok('SMTP server accepted the credentials.');
      }
      case 'sendgrid': {
        const { apiKey } = int.credentials;
        const { fromEmail, fromName } = int.publicConfig;
        if (!apiKey || !fromEmail) return missing('SendGrid API key and from-email');
        if (to) {
          const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: to }] }],
              from: { email: fromEmail, name: fromName || undefined },
              subject: 'Lumière test email',
              content: [
                {
                  type: 'text/plain',
                  value: 'Your SendGrid integration is working.',
                },
              ],
            }),
          });
          return res.ok
            ? ok(`Test email queued by SendGrid for ${to}.`)
            : fail(`SendGrid HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        }
        // No-payload probe.
        const res = await fetch('https://api.sendgrid.com/v3/user/account', {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        return res.ok
          ? ok('SendGrid API key accepted.')
          : fail(`SendGrid returned HTTP ${res.status}`);
      }
      default:
        return fail(`No probe for mail provider "${provider}"`);
    }
  }
}

function ok(message: string) {
  return { status: IntegrationTestStatus.SUCCESS, message };
}
function fail(message: string) {
  return { status: IntegrationTestStatus.FAILED, message };
}
function missing(label: string) {
  return fail(`${label} not configured.`);
}
