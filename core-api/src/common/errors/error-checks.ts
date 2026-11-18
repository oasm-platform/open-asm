import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  InvalidInputError,
  NotFoundError,
  UnauthenticatedError,
} from './domain.errors';

/*
 * For code that catches an error to act on its kind. The HTTP layer still
 * throws Nest's exceptions and services throw domain errors, so each check
 * accepts both.
 */

export const isNotFound = (
  error: unknown,
): error is NotFoundError | NotFoundException =>
  error instanceof NotFoundError || error instanceof NotFoundException;

export const isInvalidInput = (
  error: unknown,
): error is InvalidInputError | BadRequestException =>
  error instanceof InvalidInputError || error instanceof BadRequestException;

export const isUnauthenticated = (
  error: unknown,
): error is UnauthenticatedError | UnauthorizedException =>
  error instanceof UnauthenticatedError || error instanceof UnauthorizedException;
