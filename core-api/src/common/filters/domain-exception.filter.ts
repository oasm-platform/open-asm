import { DomainError, type DomainErrorKind } from '@/common/errors/domain.errors';
import type { ArgumentsHost } from '@nestjs/common';
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
import { I18nContext } from 'nestjs-i18n';
import { QueryFailedError } from 'typeorm';
import { translateErrorMessage } from '@/common/errors/error-i18n';

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
export function toHttpException(error: DomainError | QueryFailedError): Error {
  if (error instanceof DomainError) {
    return new BY_KIND[error.kind](error.message, { cause: error });
  }
  const code = (error.driverError as { code?: unknown } | undefined)?.code;
  const build = typeof code === 'string' ? BY_PG_CODE[code] : undefined;
  return build ? build() : error;
}

/**
 * The same exception with its message in the request's language (the
 * `errors` namespace), so the console can show it as is.
 */
export function localizeHttpException(
  error: HttpException,
  i18n: I18nContext | undefined,
): HttpException {
  const body = error.getResponse();
  const message =
    typeof body === 'string'
      ? body
      : (body as { message?: unknown } | null)?.message;
  if (typeof message !== 'string') return error;
  const translated = translateErrorMessage(message, i18n);
  if (translated === message) return error;
  return new HttpException(
    typeof body === 'string' ? translated : { ...body, message: translated },
    error.getStatus(),
    { cause: error },
  );
}

/**
 * Answers domain errors, client-caused database errors and Nest HTTP
 * exceptions on HTTP routes, with the message translated. Registered in
 * `configureApp` before `I18nValidationExceptionFilter`, which Nest tries
 * first, so validation errors keep their own handling. The gRPC
 * microservice keeps Nest's RPC handling.
 */
@Catch(DomainError, QueryFailedError, HttpException)
export class DomainExceptionFilter extends BaseExceptionFilter {
  catch(
    exception: DomainError | QueryFailedError | HttpException,
    host: ArgumentsHost,
  ): void {
    const error =
      exception instanceof HttpException ? exception : toHttpException(exception);
    super.catch(
      error instanceof HttpException && host.getType() === 'http'
        ? localizeHttpException(error, I18nContext.current(host))
        : error,
      host,
    );
  }
}
