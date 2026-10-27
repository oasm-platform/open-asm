import { randomUUID } from 'crypto';
import * as request from 'supertest';
import type { App } from 'supertest/types';
import type { DataSource } from 'typeorm';
import { Role } from '../src/common/enums/enum';
import { closeTestApp, createTestApp, type TestApp } from './helpers/app';
import { cleanupE2eData } from './helpers/workspace';

/**
 * First-admin bootstrap under concurrency, over real HTTP with real Postgres
 * and Redis.
 *
 * Proofs:
 *  1. Racing POST /api/admin/init calls on an install with no admin promote
 *     exactly one account. The rest are refused — 409 while the winner holds
 *     the lock, 403 once it is done — and none of them signs up an account.
 *  2. Once an admin exists, init is refused with 403.
 */
describe('First admin init (e2e)', () => {
  jest.setTimeout(60_000);

  let app: TestApp;
  let server: App;
  let dataSource: DataSource;

  let preexistingAdminIds: string[] = [];
  const password = 'e2e-init-password';
  const racers = Array.from(
    { length: 5 },
    () => `e2e-init-${randomUUID()}@example.com`,
  );
  const lateEmail = `e2e-init-late-${randomUUID()}@example.com`;

  const adminRows = () =>
    dataSource.query<{ id: string; email: string }[]>(
      'SELECT id, email FROM users WHERE role = $1',
      [Role.ADMIN],
    );

  beforeAll(async () => {
    app = await createTestApp();
    // supertest binds and closes an unbound server per request, which breaks
    // concurrent requests; one shared listener serves them all.
    await app.app.listen(0);
    server = app.server;
    dataSource = app.dataSource;

    // Init only works with zero admins, and a reused local test DB may still
    // hold some (an aborted run, manual testing). Demote them for this run;
    // afterAll restores them.
    preexistingAdminIds = (await adminRows()).map((row) => row.id);
    await dataSource.query('UPDATE users SET role = $1 WHERE role = $2', [
      Role.USER,
      Role.ADMIN,
    ]);
  });

  afterAll(async () => {
    if (dataSource) {
      const created = await dataSource.query<{ id: string }[]>(
        'SELECT id FROM users WHERE email = ANY($1)',
        [[...racers, lateEmail]],
      );
      await cleanupE2eData(dataSource, {
        userIds: created.map((row) => row.id),
      });
      await dataSource.query('UPDATE users SET role = $1 WHERE id = ANY($2)', [
        Role.ADMIN,
        preexistingAdminIds,
      ]);
    }
    await closeTestApp(app?.app);
  });

  it('promotes exactly one account when init requests race', async () => {
    const responses = await Promise.all(
      racers.map((email) =>
        request(server).post('/api/admin/init').send({ email, password }),
      ),
    );
    const statuses = responses.map((res) => res.status);

    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    for (const status of statuses.filter((s) => s !== 201)) {
      expect([403, 409]).toContain(status);
    }

    const admins = await adminRows();
    expect(admins).toHaveLength(1);
    expect(admins[0].email).toBe(racers[statuses.indexOf(201)]);

    // Losers are refused before sign-up, so no stray account exists.
    const signedUp = await dataSource.query<unknown[]>(
      'SELECT id FROM users WHERE email = ANY($1)',
      [racers],
    );
    expect(signedUp).toHaveLength(1);
  });

  it('refuses init once an admin exists', async () => {
    await request(server)
      .post('/api/admin/init')
      .send({ email: lateEmail, password })
      .expect(403);

    expect(await adminRows()).toHaveLength(1);
  });
});
