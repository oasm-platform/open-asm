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
import { isInvalidInput, isNotFound, isUnauthenticated } from './error-checks';

describe('error checks', () => {
  it('recognize a domain error and the Nest exception it replaces alike', () => {
    expect(isNotFound(new NotFoundError('x'))).toBe(true);
    expect(isNotFound(new NotFoundException('x'))).toBe(true);
    expect(isInvalidInput(new InvalidInputError('x'))).toBe(true);
    expect(isInvalidInput(new BadRequestException('x'))).toBe(true);
    expect(isUnauthenticated(new UnauthenticatedError('x'))).toBe(true);
    expect(isUnauthenticated(new UnauthorizedException('x'))).toBe(true);
  });

  it('reject other errors', () => {
    expect(isNotFound(new InvalidInputError('x'))).toBe(false);
    expect(isInvalidInput(new Error('x'))).toBe(false);
    expect(isUnauthenticated(undefined)).toBe(false);
  });
});
