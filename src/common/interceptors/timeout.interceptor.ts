import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Aborts any handler that takes longer than 15 seconds and surfaces a 408.
 * Prevents a stuck upstream (Mongo, gateway, AI provider, …) from holding
 * a request socket open indefinitely.
 *
 * Long-running operations should be enqueued onto BullMQ — never blocked
 * on inside an HTTP handler.
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      timeout(DEFAULT_TIMEOUT_MS),
      catchError((err) =>
        throwError(() =>
          err instanceof TimeoutError
            ? new RequestTimeoutException('Request timed out')
            : err,
        ),
      ),
    );
  }
}
