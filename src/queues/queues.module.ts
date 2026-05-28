import { Global, Module } from '@nestjs/common';
import { QueueService } from './queue.service';

/**
 * Background-job plumbing. Today it's an in-memory dispatcher (see
 * `QueueService`). Swap to BullMQ / SQS / Cloud Tasks by replacing the
 * `QueueService` provider without touching producers.
 */
@Global()
@Module({
  providers: [QueueService],
  exports: [QueueService],
})
export class QueuesModule {}
