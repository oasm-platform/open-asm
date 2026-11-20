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
export function toHttpException(error: DomainError | QueryFailedError): Error {
  if (error instanceof DomainError) {
    return new BY_KIND[error.kind](error.message, { cause: error });
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
    super.catch(toHttpException(exception), host);
  }
}
