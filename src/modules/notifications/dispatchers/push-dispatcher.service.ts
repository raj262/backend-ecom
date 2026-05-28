import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  DeviceToken,
  DeviceTokenDocument,
} from '../schemas/device-token.schema';

export interface PushPayload {
  /** One token or many — the dispatcher batches into ≤100 per request. */
  to: string | string[];
  title: string;
  body: string;
  /**
   * Extra payload delivered to the client — used for deep linking.
   * Example: `{ url: '/orders/abc123', kind: 'order_update' }`
   */
  data?: Record<string, unknown>;
  /** Number → iOS badge. We mirror the unread count when omitted. */
  badge?: number;
  /** Per-message sound. iOS default is `default` (system beep). */
  sound?: 'default' | null;
  /** Channel id for Android grouping. */
  channelId?: string;
  /** TTL in seconds — flash sales should expire fast (e.g. 1800). */
  ttl?: number;
  /** Default / normal / high — Expo maps to APNs / FCM priorities. */
  priority?: 'default' | 'normal' | 'high';
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_PER_BATCH = 100;

/**
 * Talks to the Expo Push HTTP API. Lives separate from the in-app
 * notifier so we can swap to APNs/FCM directly later without touching
 * the rest of the notifications module.
 *
 * Key behaviours:
 *
 *  - Batches requests at 100 messages each (Expo's hard limit).
 *  - Honours bad-token errors (`DeviceNotRegistered`,
 *    `InvalidCredentials`) by soft-disabling the offending row so we
 *    never spam dead tokens again.
 *  - Uses `EXPO_ACCESS_TOKEN` when configured — required for Expo
 *    accounts with "enhanced security" turned on.
 */
@Injectable()
export class PushDispatcherService {
  private readonly logger = new Logger(PushDispatcherService.name);

  constructor(
    @InjectModel(DeviceToken.name)
    private readonly deviceModel: Model<DeviceTokenDocument>,
    private readonly config: ConfigService,
  ) {}

  /** Dispatches a single payload to one or many devices. */
  async send(payload: PushPayload): Promise<{ sent: number; failed: number }> {
    const tokens = Array.isArray(payload.to) ? payload.to : [payload.to];
    const clean = tokens.filter((t) => isExpoToken(t));
    if (clean.length === 0) {
      return { sent: 0, failed: 0 };
    }

    let sent = 0;
    let failed = 0;
    for (let i = 0; i < clean.length; i += MAX_PER_BATCH) {
      const chunk = clean.slice(i, i + MAX_PER_BATCH);
      const messages = chunk.map((to) => ({
        to,
        sound: payload.sound === null ? undefined : (payload.sound ?? 'default'),
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
        ...(payload.badge !== undefined && { badge: payload.badge }),
        ...(payload.channelId && { channelId: payload.channelId }),
        ...(payload.ttl !== undefined && { ttl: payload.ttl }),
        ...(payload.priority && { priority: payload.priority }),
      }));
      const tickets = await this.post(messages);
      for (let idx = 0; idx < tickets.length; idx++) {
        const ticket = tickets[idx];
        const token = chunk[idx];
        if (ticket?.status === 'ok') {
          sent++;
        } else {
          failed++;
          await this.handleBadTicket(token, ticket);
        }
      }
    }
    return { sent, failed };
  }

  /**
   * Dispatch to every active device for a list of user ids — used by
   * the in-app notifier so callers don't need to know about tokens.
   */
  async sendToUsers(
    userIds: string[],
    payload: Omit<PushPayload, 'to'>,
  ): Promise<{ sent: number; failed: number }> {
    if (userIds.length === 0) return { sent: 0, failed: 0 };
    const ids = userIds
      .filter((u) => Types.ObjectId.isValid(u))
      .map((u) => new Types.ObjectId(u));
    const devices = await this.deviceModel
      .find({ userId: { $in: ids }, enabled: true })
      .select('token')
      .exec();
    if (devices.length === 0) return { sent: 0, failed: 0 };
    return this.send({ ...payload, to: devices.map((d) => d.token) });
  }

  // ---------------------------------------------------------------------

  private async post(
    messages: Array<Record<string, unknown>>,
  ): Promise<ExpoTicket[]> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    };
    const accessToken = this.config.get<string>('EXPO_ACCESS_TOKEN');
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(messages),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.warn(
          `Expo push API ${res.status}: ${text || res.statusText}`,
        );
        return messages.map(() => ({
          status: 'error' as const,
          message: `HTTP ${res.status}`,
        }));
      }
      const json = (await res.json()) as { data?: ExpoTicket[] };
      return json.data ?? [];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Push transport error: ${msg}`);
      return messages.map(() => ({
        status: 'error' as const,
        message: msg,
      }));
    }
  }

  private async handleBadTicket(token: string, ticket?: ExpoTicket) {
    const error = ticket?.details?.error ?? '';
    const message = ticket?.message ?? '';
    const isPermanent =
      error === 'DeviceNotRegistered' ||
      error === 'InvalidCredentials' ||
      message.includes('not a registered push notification recipient');

    if (!isPermanent) {
      this.logger.warn(
        `Transient push failure for ${token.slice(0, 22)}…: ${message}`,
      );
      return;
    }
    await this.deviceModel
      .updateOne(
        { token },
        { $set: { enabled: false, disabledAt: new Date() } },
      )
      .exec();
    this.logger.log(
      `Disabled push token ${token.slice(0, 22)}… (${error || 'unknown'})`,
    );
  }
}

function isExpoToken(t: unknown): t is string {
  return (
    typeof t === 'string' &&
    /^ExponentPushToken\[[A-Za-z0-9_\-]{10,}\]$/.test(t)
  );
}
