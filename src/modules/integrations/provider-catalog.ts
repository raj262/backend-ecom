import { IntegrationKey } from './schemas/integration.schema';

/**
 * Declarative description of every provider the platform supports.
 * The admin UI fetches `GET /admin/integrations/catalog` and uses this
 * to render the provider-selector + dynamic credential form. Backend
 * services use it to validate that the right credential fields exist
 * before persisting.
 *
 * Adding a provider here is enough — no UI or schema change required.
 */
export type CatalogFieldType =
  | 'text'
  | 'password'
  | 'email'
  | 'url'
  | 'number'
  | 'select'
  | 'boolean';

export interface CatalogField {
  name: string;
  label: string;
  type: CatalogFieldType;
  /** If true, persisted in `credentials` (encrypted). Otherwise in `publicConfig`. */
  secret: boolean;
  /** Field is mandatory for save? */
  required?: boolean;
  placeholder?: string;
  hint?: string;
  /** For `select` type. */
  options?: Array<{ value: string; label: string }>;
}

export interface CatalogProvider {
  id: string;
  label: string;
  description: string;
  /** Logo path (under /assets), optional. UI falls back to initials. */
  logo?: string;
  /** Anything important the operator should know before flipping enabled. */
  docsUrl?: string;
  fields: CatalogField[];
}

export interface CatalogSection {
  key: IntegrationKey;
  label: string;
  description: string;
  providers: CatalogProvider[];
}

// ---------------------------------------------------------------------------

const SMTP_FIELDS: CatalogField[] = [
  {
    name: 'host',
    label: 'SMTP host',
    type: 'text',
    secret: false,
    required: true,
    placeholder: 'smtp.gmail.com',
  },
  {
    name: 'port',
    label: 'Port',
    type: 'number',
    secret: false,
    required: true,
    placeholder: '587',
    hint: '465 for SSL, 587 for STARTTLS.',
  },
  {
    name: 'secure',
    label: 'Use SSL (port 465)',
    type: 'boolean',
    secret: false,
  },
  {
    name: 'user',
    label: 'Username',
    type: 'text',
    secret: false,
    required: true,
    placeholder: 'you@example.com',
  },
  {
    name: 'pass',
    label: 'Password / App password',
    type: 'password',
    secret: true,
    required: true,
    hint: 'For Gmail/Outlook use an App Password, not your account password.',
  },
  {
    name: 'fromEmail',
    label: 'From email',
    type: 'email',
    secret: false,
    required: true,
    placeholder: 'orders@yourstore.com',
  },
  {
    name: 'fromName',
    label: 'From name',
    type: 'text',
    secret: false,
    placeholder: 'Lumière',
  },
];

export const PROVIDER_CATALOG: CatalogSection[] = [
  // -------------------------------------------------------------------
  // PAYMENT
  // -------------------------------------------------------------------
  {
    key: IntegrationKey.PAYMENT,
    label: 'Payments',
    description:
      'Accept card / UPI / wallet payments. Pick one gateway; the rest stay dormant.',
    providers: [
      {
        id: 'razorpay',
        label: 'Razorpay',
        description: 'India-first gateway with UPI, cards, netbanking, wallets.',
        docsUrl: 'https://razorpay.com/docs',
        fields: [
          {
            name: 'keyId',
            label: 'Key ID',
            type: 'text',
            secret: false,
            required: true,
            placeholder: 'rzp_live_xxx or rzp_test_xxx',
          },
          {
            name: 'keySecret',
            label: 'Key secret',
            type: 'password',
            secret: true,
            required: true,
          },
          {
            name: 'webhookSecret',
            label: 'Webhook secret',
            type: 'password',
            secret: true,
            hint: 'Optional. Required to verify Razorpay webhooks.',
          },
        ],
      },
      {
        id: 'easebuzz',
        label: 'Easebuzz',
        description: 'Indian PA/PG with payouts. Good for high-volume retail.',
        docsUrl: 'https://docs.easebuzz.in',
        fields: [
          { name: 'key', label: 'Key', type: 'text', secret: false, required: true },
          {
            name: 'salt',
            label: 'Salt',
            type: 'password',
            secret: true,
            required: true,
          },
          {
            name: 'env',
            label: 'Environment',
            type: 'select',
            secret: false,
            required: true,
            options: [
              { value: 'test', label: 'Test' },
              { value: 'prod', label: 'Production' },
            ],
          },
        ],
      },
      {
        id: 'stripe',
        label: 'Stripe',
        description: 'Global cards + Apple/Google Pay. Best for international.',
        docsUrl: 'https://stripe.com/docs/keys',
        fields: [
          {
            name: 'publishableKey',
            label: 'Publishable key',
            type: 'text',
            secret: false,
            required: true,
            placeholder: 'pk_live_xxx',
          },
          {
            name: 'secretKey',
            label: 'Secret key',
            type: 'password',
            secret: true,
            required: true,
            placeholder: 'sk_live_xxx',
          },
          {
            name: 'webhookSecret',
            label: 'Webhook signing secret',
            type: 'password',
            secret: true,
            hint: 'Optional but recommended for webhook verification.',
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  // SMS
  // -------------------------------------------------------------------
  {
    key: IntegrationKey.SMS,
    label: 'SMS',
    description: 'Transactional SMS for OTP, order confirmations, delivery alerts.',
    providers: [
      {
        id: 'twilio',
        label: 'Twilio',
        description: 'Global SMS + voice. Pay per message.',
        docsUrl: 'https://www.twilio.com/docs/sms',
        fields: [
          {
            name: 'accountSid',
            label: 'Account SID',
            type: 'text',
            secret: false,
            required: true,
            placeholder: 'AC…',
          },
          {
            name: 'authToken',
            label: 'Auth token',
            type: 'password',
            secret: true,
            required: true,
          },
          {
            name: 'fromNumber',
            label: 'From number',
            type: 'text',
            secret: false,
            required: true,
            placeholder: '+15551234567',
            hint: 'Must be a verified sender / purchased Twilio number.',
          },
        ],
      },
      {
        id: 'msg91',
        label: 'MSG91',
        description: 'India SMS gateway with DLT-compliant routes.',
        docsUrl: 'https://docs.msg91.com',
        fields: [
          {
            name: 'authKey',
            label: 'Auth key',
            type: 'password',
            secret: true,
            required: true,
          },
          {
            name: 'senderId',
            label: 'Sender ID',
            type: 'text',
            secret: false,
            required: true,
            placeholder: 'LUMIRE',
            hint: '6 characters, registered with DLT.',
          },
          {
            name: 'route',
            label: 'Route',
            type: 'select',
            secret: false,
            options: [
              { value: '4', label: 'Transactional (route 4)' },
              { value: '1', label: 'Promotional (route 1)' },
            ],
          },
          {
            name: 'countryCode',
            label: 'Default country code',
            type: 'text',
            secret: false,
            placeholder: '91',
          },
        ],
      },
      {
        id: 'vonage',
        label: 'Vonage',
        description: 'Formerly Nexmo. Global SMS at scale.',
        docsUrl: 'https://developer.vonage.com/messaging/sms/overview',
        fields: [
          { name: 'apiKey', label: 'API key', type: 'text', secret: false, required: true },
          {
            name: 'apiSecret',
            label: 'API secret',
            type: 'password',
            secret: true,
            required: true,
          },
          {
            name: 'fromName',
            label: 'From',
            type: 'text',
            secret: false,
            required: true,
            placeholder: 'Lumière',
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  // WHATSAPP
  // -------------------------------------------------------------------
  {
    key: IntegrationKey.WHATSAPP,
    label: 'WhatsApp',
    description:
      'Order updates, shipping ETAs, abandoned-cart nudges via WhatsApp Business.',
    providers: [
      {
        id: 'meta_cloud',
        label: 'WhatsApp Cloud API (Meta)',
        description: 'Direct from Meta. Lowest fees, most control.',
        docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
        fields: [
          {
            name: 'phoneNumberId',
            label: 'Phone number ID',
            type: 'text',
            secret: false,
            required: true,
          },
          {
            name: 'accessToken',
            label: 'Permanent access token',
            type: 'password',
            secret: true,
            required: true,
          },
          {
            name: 'businessAccountId',
            label: 'Business account ID',
            type: 'text',
            secret: false,
          },
          {
            name: 'verifyToken',
            label: 'Webhook verify token',
            type: 'password',
            secret: true,
            hint: 'Used to verify Meta webhook handshake.',
          },
        ],
      },
      {
        id: 'twilio_wa',
        label: 'Twilio WhatsApp',
        description: 'Use your existing Twilio account; quick to set up.',
        docsUrl: 'https://www.twilio.com/docs/whatsapp',
        fields: [
          {
            name: 'accountSid',
            label: 'Account SID',
            type: 'text',
            secret: false,
            required: true,
          },
          {
            name: 'authToken',
            label: 'Auth token',
            type: 'password',
            secret: true,
            required: true,
          },
          {
            name: 'fromNumber',
            label: 'From WhatsApp number',
            type: 'text',
            secret: false,
            required: true,
            placeholder: 'whatsapp:+14155238886',
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  // MAIL
  // -------------------------------------------------------------------
  {
    key: IntegrationKey.MAIL,
    label: 'Email',
    description: 'Transactional email — order confirmations, password reset, invoices.',
    providers: [
      {
        id: 'gmail',
        label: 'Gmail (SMTP)',
        description: 'Google Workspace or personal Gmail via App Password.',
        docsUrl: 'https://support.google.com/accounts/answer/185833',
        fields: SMTP_FIELDS.map((f) => ({
          ...f,
          placeholder:
            f.name === 'host'
              ? 'smtp.gmail.com'
              : f.name === 'port'
                ? '465'
                : f.placeholder,
        })),
      },
      {
        id: 'outlook',
        label: 'Outlook / Office 365 (SMTP)',
        description: 'smtp.office365.com on port 587 with STARTTLS.',
        docsUrl:
          'https://learn.microsoft.com/en-us/exchange/mail-flow-best-practices/how-to-set-up-a-multifunction-device-or-application-to-send-email-using-microsoft-365-or-office-365',
        fields: SMTP_FIELDS.map((f) => ({
          ...f,
          placeholder:
            f.name === 'host'
              ? 'smtp.office365.com'
              : f.name === 'port'
                ? '587'
                : f.placeholder,
        })),
      },
      {
        id: 'smtp',
        label: 'Custom SMTP',
        description: 'Any RFC-compliant SMTP server (Zoho, FastMail, your own…).',
        fields: SMTP_FIELDS,
      },
      {
        id: 'sendgrid',
        label: 'SendGrid (HTTP API)',
        description:
          'High-volume HTTP API. No SMTP fiddling. Free up to 100 emails / day.',
        docsUrl: 'https://docs.sendgrid.com',
        fields: [
          {
            name: 'apiKey',
            label: 'API key',
            type: 'password',
            secret: true,
            required: true,
            placeholder: 'SG.xxx',
          },
          {
            name: 'fromEmail',
            label: 'From email',
            type: 'email',
            secret: false,
            required: true,
            placeholder: 'orders@yourstore.com',
            hint: 'Must be a verified sender in SendGrid.',
          },
          {
            name: 'fromName',
            label: 'From name',
            type: 'text',
            secret: false,
            placeholder: 'Lumière',
          },
        ],
      },
    ],
  },
];

/** Quick lookup by `(key, providerId)`. */
export function findProvider(
  key: IntegrationKey,
  providerId: string,
): CatalogProvider | undefined {
  return PROVIDER_CATALOG.find((s) => s.key === key)?.providers.find(
    (p) => p.id === providerId,
  );
}
