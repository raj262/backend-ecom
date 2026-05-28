import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';

/**
 * Logs every HTTP request → status + latency. Slow requests (>500ms) are
 * surfaced at warn level so they show up in production logs.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const started = Date.now();
    const { method, originalUrl } = req;

    return next.handle().pipe(
      tap(() => {
        const status = ctx.switchToHttp().getResponse<{ statusCode: number }>()
          .statusCode;
        const elapsed = Date.now() - started;
        const line = `${method} ${originalUrl} → ${status} (${elapsed}ms)`;
        if (elapsed > 500) this.logger.warn(line);
        else this.logger.log(line);
      }),
    );
  }
}
