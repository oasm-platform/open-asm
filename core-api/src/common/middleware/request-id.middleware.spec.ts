import { requestIdMiddleware } from '@/common/middleware/request-id.middleware';
import type { RequestWithMetadata } from '@/common/interfaces/app.interface';
import type { Response } from 'express';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('requestIdMiddleware', () => {
  let req: Partial<RequestWithMetadata>;
  let res: { setHeader: jest.Mock };
  let next: jest.Mock;

  beforeEach(() => {
    req = { headers: {} };
    res = { setHeader: jest.fn() };
    next = jest.fn();
  });

  const run = () =>
    requestIdMiddleware(
      req as RequestWithMetadata,
      res as unknown as Response,
      next,
    );

  it('sets req.requestId to a UUID and calls next', () => {
    run();
    expect(req.requestId).toMatch(UUID_RE);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('mirrors requestId into the X-Request-Id response header', () => {
    run();
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', req.requestId);
  });

  it('honors a valid incoming X-Request-Id header (Node lowercases header names)', () => {
    const incoming = '11111111-1111-4111-8111-111111111111';
    req.headers['x-request-id'] = incoming;
    run();
    expect(req.requestId).toBe(incoming);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', incoming);
  });

  it('generates a fresh id when the incoming header is malformed', () => {
    req.headers['x-request-id'] = 'not-a-uuid';
    run();
    expect(req.requestId).toMatch(UUID_RE);
    expect(req.requestId).not.toBe('not-a-uuid');
  });

  it('keeps an already-set requestId stable (idempotent re-run)', () => {
    req.requestId = '22222222-2222-4222-8222-222222222222';
    run();
    expect(req.requestId).toBe('22222222-2222-4222-8222-222222222222');
  });
});
