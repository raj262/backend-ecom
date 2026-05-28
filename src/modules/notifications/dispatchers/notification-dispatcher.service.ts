import { Injectable, Logger } from '@nestjs/common';
import { IntegrationKey } from '../../integrations/schemas/integration.schema';
import { IntegrationsService } from '../../integrations/services/integrations.service';

export interface EmailDispatch {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SmsDispatch {
  to: string;
  body: string;
}

export interface WhatsappDispatch {
  to: string;
  body: string;
}

/**
 * Plain-Node dispatchers that turn an "intent" payload into a real
 * provider HTTP call (or SMTP send) using whichever integration the
 * admin has enabled. If no integration is configured, we no-op and
 * log — never throw — so the notification queue keeps draining.
 */
@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);

  constructor(private readonly integrations: IntegrationsService) {}

  // -------------------------------------------------------------------
  // Email
  // -------------------------------------------------------------------

  async sendEmail(payload: EmailDispatch): Promise<void> {
    const active = await this.integrations.resolveActive(IntegrationKey.MAIL);
    if (!active) {
      this.logger.log(
        `[EMAIL no-op → ${payload.to}] ${payload.subject} (no enabled mail integration)`,
      );
      return;
    }
    try {
      switch (active.provider) {
        case 'gmail':
        case 'outlook':
        case 'smtp':
          await this.sendViaSmtp(active, payload);
          return;
        case 'sendgrid':
          await this.sendViaSendGrid(active, payload);
          return;
        default:
          this.logger.warn(`Unknown mail provider "${active.provider}"`);
      }
    } catch (err) {
      this.logger.error(
        `Email dispatch failed via ${active.provider}: ${(err as Error).message}`,
      );
    }
  }

  private async sendViaSmtp(
    active: { credentials: Record<string, string>; publicConfig: Record<string, string> },
    payload: EmailDispatch,
  ): Promise<void> {
    const nodemailer = await import('nodemailer');
    const { host, port, secure, user, fromEmail, fromName } = active.publicConfig;
    const { pass } = active.credentials;
    const transport = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: secure === 'true' || port === '465',
      auth: { user, pass },
    });
    await transport.sendMail({
      from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
      to: payload.to,
      subject: payload.subject,
      text: payload.text ?? stripHtml(payload.html),
      html: payload.html,
    });
  }

  private async sendViaSendGrid(
    active: { credentials: Record<string, string>; publicConfig: Record<string, string> },
    payload: EmailDispatch,
  ): Promise<void> {
    const { apiKey } = active.credentials;
    const { fromEmail, fromName } = active.publicConfig;
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: payload.to }] }],
        from: { email: fromEmail, name: fromName || undefined },
        subject: payload.subject,
        content: [
          { type: 'text/plain', value: payload.text ?? stripHtml(payload.html) },
          { type: 'text/html', value: payload.html },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(
        `SendGrid HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
      );
    }
  }

  // -------------------------------------------------------------------
  // SMS
  // -------------------------------------------------------------------

  async sendSms(payload: SmsDispatch): Promise<void> {
    const active = await this.integrations.resolveActive(IntegrationKey.SMS);
    if (!active) {
      this.logger.log(
        `[SMS no-op → ${payload.to}] ${payload.body} (no enabled SMS integration)`,
      );
      return;
    }
    try {
      switch (active.provider) {
        case 'twilio':
          await this.sendSmsTwilio(active, payload);
          return;
        case 'msg91':
          await this.sendSmsMsg91(active, payload);
          return;
        case 'vonage':
          await this.sendSmsVonage(active, payload);
          return;
        default:
          this.logger.warn(`Unknown SMS provider "${active.provider}"`);
      }
    } catch (err) {
      this.logger.error(
        `SMS dispatch failed via ${active.provider}: ${(err as Error).message}`,
      );
    }
  }

  private async sendSmsTwilio(
    active: { credentials: Record<string, string>; publicConfig: Record<string, string> },
    payload: SmsDispatch,
  ): Promise<void> {
    const { accountSid, fromNumber } = active.publicConfig;
    const { authToken } = active.credentials;
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const body = new URLSearchParams({
      From: fromNumber,
      To: payload.to,
      Body: payload.body,
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
    if (!res.ok) {
      throw new Error(
        `Twilio HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
      );
    }
  }

  private async sendSmsMsg91(
    active: { credentials: Record<string, string>; publicConfig: Record<string, string> },
    payload: SmsDispatch,
  ): Promise<void> {
    const { authKey } = active.credentials;
    const { senderId, route, countryCode } = active.publicConfig;
    const res = await fetch('https://api.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: {
        authkey: authKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: senderId,
        route,
        country: countryCode || '91',
        mobiles: payload.to,
        message: payload.body,
      }),
    });
    if (!res.ok) {
      throw new Error(`MSG91 HTTP ${res.status}`);
    }
  }

  private async sendSmsVonage(
    active: { credentials: Record<string, string>; publicConfig: Record<string, string> },
    payload: SmsDispatch,
  ): Promise<void> {
    const { apiKey, fromName } = active.publicConfig;
    const { apiSecret } = active.credentials;
    const body = new URLSearchParams({
      api_key: apiKey,
      api_secret: apiSecret,
      from: fromName,
      to: payload.to,
      text: payload.body,
    });
    const res = await fetch('https://rest.nexmo.com/sms/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      throw new Error(`Vonage HTTP ${res.status}`);
    }
  }

  // -------------------------------------------------------------------
  // WhatsApp
  // -------------------------------------------------------------------

  async sendWhatsapp(payload: WhatsappDispatch): Promise<void> {
    const active = await this.integrations.resolveActive(IntegrationKey.WHATSAPP);
    if (!active) {
      this.logger.log(
        `[WA no-op → ${payload.to}] ${payload.body} (no enabled WhatsApp integration)`,
      );
      return;
    }
    try {
      switch (active.provider) {
        case 'meta_cloud':
          await this.sendWaMeta(active, payload);
          return;
        case 'twilio_wa':
          await this.sendWaTwilio(active, payload);
          return;
        default:
          this.logger.warn(`Unknown WhatsApp provider "${active.provider}"`);
      }
    } catch (err) {
      this.logger.error(
        `WhatsApp dispatch failed via ${active.provider}: ${(err as Error).message}`,
      );
    }
  }

  private async sendWaMeta(
    active: { credentials: Record<string, string>; publicConfig: Record<string, string> },
    payload: WhatsappDispatch,
  ): Promise<void> {
    const { phoneNumberId } = active.publicConfig;
    const { accessToken } = active.credentials;
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
          to: payload.to,
          type: 'text',
          text: { body: payload.body },
        }),
      },
    );
    if (!res.ok) {
      throw new Error(
        `Meta HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
      );
    }
  }

  private async sendWaTwilio(
    active: { credentials: Record<string, string>; publicConfig: Record<string, string> },
    payload: WhatsappDispatch,
  ): Promise<void> {
    const { accountSid, fromNumber } = active.publicConfig;
    const { authToken } = active.credentials;
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const target = payload.to.startsWith('whatsapp:')
      ? payload.to
      : `whatsapp:${payload.to}`;
    const body = new URLSearchParams({
      From: fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`,
      To: target,
      Body: payload.body,
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
    if (!res.ok) {
      throw new Error(`Twilio HTTP ${res.status}`);
    }
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}
