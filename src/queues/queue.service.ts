import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import IORedis, { Redis } from 'ioredis';

export type JobName =
  | 'email.send'
  | 'sms.send'
  | 'whatsapp.send'
  | 'push.send'
  | 'push.broadcast'
  | 'push.personalized-offers'
  | 'invoice.generate'
  | 'analytics.event'
  | 'abandoned-cart.scan'
  | 'price-drop.scan';

type JobHandler<T = unknown> = (payload: T) => Promise<void> | void;

/**
 * Hybrid queue dispatcher.
 *
 *   - When `REDIS_URL` is set → uses BullMQ (durable, retriable, observable).
 *   - When unset → runs handlers inline so dev/CI works without a Redis.
 *
 * Producers don't care which mode is active; they just call `enqueue`.
 * Consumers register exactly once on boot via `register()`.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger('Queue');
  private readonly handlers = new Map<JobName, JobHandler>();
  private readonly queues = new Map<JobName, Queue>();
  private readonly workers: Worker[] = [];
  private readonly redisUrl?: string;
  private connection: Redis | null = null;

  constructor(config: ConfigService) {
    this.redisUrl = config.get<string>('REDIS_URL');
    if (!this.redisUrl) {
      this.logger.warn(
        'REDIS_URL not set — queue jobs will run inline. Set REDIS_URL to enable durable BullMQ queues.',
      );
    } else {
      this.connection = new IORedis(this.redisUrl, {
        maxRetriesPerRequest: null,
      });
    }
  }

  register<T>(name: JobName, handler: JobHandler<T>) {
    this.handlers.set(name, handler as JobHandler);
    if (!this.connection) return;
    const worker = new Worker(
      name,
      async (job) => handler(job.data as T),
      { connection: this.connection },
    );
    worker.on('failed', (job, err) =>
      this.logger.error(`Job ${name}#${job?.id} failed: ${err.message}`),
    );
    this.workers.push(worker);
  }

  /**
   * Register a recurring job. In BullMQ mode this calls `add` with a
   * `repeat: { every }` option so the queue itself owns the cron and
   * multiple replicas don't double-fire. In inline mode it falls back
   * to a local interval — fine for single-process dev.
   *
   * Idempotent: re-calling with the same `name` won't stack timers.
   */
  schedule<T>(
    name: JobName,
    payload: T,
    opts: { everyMs: number; name?: string },
  ): void {
    if (this.scheduledNames.has(name)) return;
    this.scheduledNames.add(name);
    if (this.connection) {
      let queue = this.queues.get(name);
      if (!queue) {
        queue = new Queue(name, { connection: this.connection });
        this.queues.set(name, queue);
      }
      void queue.add(opts.name ?? name, payload, {
        repeat: { every: opts.everyMs },
        removeOnComplete: 50,
        removeOnFail: 200,
      });
      return;
    }
    const timer = setInterval(() => {
      void this.enqueue(name, payload);
    }, opts.everyMs);
    timer.unref?.();
    this.timers.push(timer);
  }

  private scheduledNames = new Set<JobName>();
  private timers: NodeJS.Timeout[] = [];

  async enqueue<T>(name: JobName, payload: T): Promise<void> {
    if (!this.connection) {
      const handler = this.handlers.get(name);
      if (!handler) {
        this.logger.warn(`No inline handler for "${name}", dropping job.`);
        return;
      }
      try {
        await handler(payload);
      } catch (err) {
        this.logger.error(`Inline job "${name}" failed`, err as Error);
      }
      return;
    }
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection: this.connection });
      this.queues.set(name, queue);
    }
    await queue.add(name, payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  }

  async onModuleDestroy() {
    this.timers.forEach((t) => clearInterval(t));
    this.timers = [];
    await Promise.all([
      ...this.workers.map((w) => w.close()),
      ...Array.from(this.queues.values()).map((q) => q.close()),
    ]);
    if (this.connection) await this.connection.quit();
  }
}
