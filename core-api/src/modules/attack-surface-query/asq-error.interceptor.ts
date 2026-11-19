import {
  HttpException,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { catchError, type Observable, throwError } from 'rxjs';

import { AsqError } from './domain/query-errors';

/**
 * Turns an AsqError into an HttpException with its status and the body
 * `{ error: { code, message, issues?, cost?, hints? } }`, so the platform's
 * own exception handling renders it.
 */
@Injectable()
export class AsqErrorInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((err: unknown) =>
        throwError(() =>
          err instanceof AsqError ? new HttpException({ error: err.toJSON() }, err.status) : err,
        ),
      ),
    );
  }
}
