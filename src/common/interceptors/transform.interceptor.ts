import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';

export interface ApiEnvelope<T> {
  data: T;
  meta: { timestamp: string };
}

/**
 * Wraps successful responses in a `{ data, meta }` envelope. Disabled by
 * default (not wired in `AppModule`) so existing clients aren't broken — opt
 * in per-controller with `@UseInterceptors(TransformInterceptor)`.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiEnvelope<T>> {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<ApiEnvelope<T>> {
    return next.handle().pipe(
      map((data: T) => ({
        data,
        meta: { timestamp: new Date().toISOString() },
      })),
    );
  }
}
