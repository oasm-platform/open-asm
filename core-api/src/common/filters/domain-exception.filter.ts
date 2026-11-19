import { DomainError, type DomainErrorKind } from '@/common/errors/domain.errors';
import type { ArgumentsHost } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import {
  BadRequestException,
  Catch,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { QueryFailedError } from 'typeorm';

type HttpExceptionClass = new (
  message: string,
  options?: { cause?: unknown },
) => HttpException;

const BY_KIND: Record<DomainErrorKind, HttpExceptionClass> = {
  invalid_input: BadRequestException,
  unauthenticated: UnauthorizedException,
  forbidden: ForbiddenException,
  not_found: NotFoundException,
  conflict: ConflictException,
};

/** Postgres error codes a client caused, answered without database detail. */
const BY_PG_CODE: Record<string, () => HttpException> = {
  // unique_violation: a concurrent duplicate the service did not catch
  '23505': () => new ConflictException('A record with the same values already exists'),
  // invalid_text_representation: e.g. a malformed uuid reaching a query
  '22P02': () => new BadRequestException('Invalid input syntax'),
};

/**
 * The HTTP exception a domain or database error stands for, built with
 * Nest's own classes so the body is exactly what Nest sends for them
 * (`{ statusCode, message, error }`). Anything else is returned unchanged
 * for the default 500 handling.
 */
type Translator = {
  translate(key: string, options?: Record<string, unknown>): string;
};

export function toHttpException(
  error: DomainError | QueryFailedError,
  i18n?: Translator,
  lang?: string,
): Error {
  if (error instanceof DomainError) {
    const translated =
      error.i18n && i18n
        ? i18n.translate(error.i18n.key, {
            lang: lang ?? 'en',
            args: error.i18n.args,
          })
        : undefined;
    const message =
      typeof translated === 'string' ? translated : error.message;
    return new BY_KIND[error.kind](message, { cause: error });
  }
  const code = (error.driverError as { code?: unknown } | undefined)?.code;
  const build = typeof code === 'string' ? BY_PG_CODE[code] : undefined;
  return build ? build() : error;
}

/**
 * Answers domain errors and client-caused database errors on HTTP routes.
 * Registered in `configureApp`, so it covers HTTP only: the gRPC
 * microservice keeps Nest's RPC handling.
 */
@Catch(DomainError, QueryFailedError)
export class DomainExceptionFilter extends BaseExceptionFilter {
  catch(exception: DomainError | QueryFailedError, host: ArgumentsHost): void {
    // Null when the throw happens outside a request (gRPC, BullMQ, tools):
    // those transports keep the raw message, only HTTP translates.
    const lang = I18nContext.current()?.lang;
    const i18n = lang ? I18nContext.current()?.service : undefined;
    super.catch(toHttpException(exception, i18n, lang), host);
  }
}
