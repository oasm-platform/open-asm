import {
  ConflictError,
  ForbiddenError,
  InvalidInputError,
  NotFoundError,
  UnauthenticatedError,
} from '@/common/errors/domain.errors';
import type { ArgumentsHost, HttpServer } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { QueryFailedError } from 'typeorm';
import { DomainExceptionFilter, toHttpException } from './domain-exception.filter';

const queryFailed = (code: string) =>
  new QueryFailedError('SELECT 1', [], Object.assign(new Error('pg'), { code }));

describe('toHttpException', () => {
  it.each([
    [new InvalidInputError('Bad name'), 400, 'Bad Request'],
    [new UnauthenticatedError('Invalid token'), 401, 'Unauthorized'],
    [new ForbiddenError('Not yours'), 403, 'Forbidden'],
    [new NotFoundError('Target not found'), 404, 'Not Found'],
    [new ConflictError('Already a member'), 409, 'Conflict'],
  ])('answers %p with the body Nest gives its own exception', (error, status, label) => {
    const http = toHttpException(error) as HttpException;

    expect(http).toBeInstanceOf(HttpException);
    expect(http.getStatus()).toBe(status);
    expect(http.getResponse()).toEqual({
      statusCode: status,
      message: error.message,
      error: label,
    });
  });

  it('uses the default text when an error is thrown without a message', () => {
    expect((toHttpException(new NotFoundError()) as HttpException).getResponse())
      .toEqual({ statusCode: 404, message: 'Not Found', error: 'Not Found' });
  });

  it('keeps the domain error as the cause', () => {
    const error = new ConflictError('Taken');

    expect((toHttpException(error) as HttpException).cause).toBe(error);
  });

  it('answers a unique violation with 409 and no database detail', () => {
    const http = toHttpException(queryFailed('23505')) as HttpException;

    expect(http.getStatus()).toBe(409);
    expect(JSON.stringify(http.getResponse())).not.toContain('pg');
  });

  it('answers malformed input the database rejected with 400', () => {
    expect((toHttpException(queryFailed('22P02')) as HttpException).getStatus())
      .toBe(400);
  });

  it('leaves any other database error to the default 500 handling', () => {
    const error = queryFailed('40001');

    expect(toHttpException(error)).toBe(error);
  });
});

describe('toHttpException with i18n', () => {
  it('keeps the raw message when the error carries no i18n key', () => {
    const http = toHttpException(
      new NotFoundError('Target not found'),
    ) as HttpException;

    expect(http.getResponse()).toEqual({
      statusCode: 404,
      message: 'Target not found',
      error: 'Not Found',
    });
  });

  it('translates the message when the error carries an i18n key', () => {
    const error = new NotFoundError('Target not found', {
      i18n: { key: 'notification.WORKSPACE_CREATED', args: { name: 'A' } },
    });
    const translate = jest.fn().mockReturnValue('Workspace A created');
    const i18n = { translate } as never;
    const lang = 'en';

    const http = toHttpException(error, i18n, lang) as HttpException;

    expect(translate).toHaveBeenCalledWith('notification.WORKSPACE_CREATED', {
      lang,
      args: { name: 'A' },
    });
    expect(http.getResponse()).toEqual({
      statusCode: 404,
      message: 'Workspace A created',
      error: 'Not Found',
    });
  });
});

describe('DomainExceptionFilter', () => {
  it('hands the mapped exception to the base filter', () => {
    const base = jest
      .spyOn(BaseExceptionFilter.prototype, 'catch')
      .mockImplementation(() => undefined);
    const filter = new DomainExceptionFilter({} as HttpServer);
    const host = {} as ArgumentsHost;

    filter.catch(new NotFoundError('Gone'), host);

    const [exception, passedHost] = base.mock.calls[0];
    expect((exception as HttpException).getStatus()).toBe(404);
    expect(passedHost).toBe(host);
    base.mockRestore();
  });
});
