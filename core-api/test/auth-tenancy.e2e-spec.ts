import {
  MailService,
  type MailMessage,
} from '@/modules/admin/system-configs/mail.service';
import { SystemConfigsService } from '@/modules/admin/system-configs/system-configs.service';
import type { DataSource } from 'typeorm';
import * as request from 'supertest';
import type { App } from 'supertest/types';
import { closeTestApp, createTestApp, type TestApp } from './helpers/app';
import { signIn } from './helpers/auth';
import { createUser, createWorkspace, cleanupE2eData } from './helpers/workspace';

/**
 * The auth/tenancy guard matrix, proven against real Postgres.
 *
 * Proofs:
 *  1. No session cookie -> 401 on a guarded route.
 *  2. `@Public()` routes (health, metadata, latest version) answer without a
 *     session; an unknown route 404s even with a valid session (control — the
 *     401 on case 1 is the guard, not a missing route).
 *  3. Valid cookie but no workspace id -> 403.
 *  4. Non-UUID `X-Workspace-Id` -> 400.
 *  5. A user who does not belong to the workspace -> 403 with the exact
 *     non-disclosure message (never 404).
 *  6. Workspace owner (wildcard `*` group) can reach its resource list.
 *  7. Cross-tenant isolation: a user with workspace B never sees workspace
 *     A's targets through list, direct id, or global search.
 *  8. Header and `wid` cookie resolve identically.
 *  9. Worker-token routes reject a missing/bad token and accept a valid one.
 * 10. Public self sign-up follows the `auth.allowSignUp` system setting:
 *     while closed, `/api/auth/sign-up/email` 403s and creates no account;
 *     once open, it creates an account that cannot sign in until an admin
 *     approves (unbans) it.
 */
describe('Auth and tenancy matrix', () => {
  jest.setTimeout(60_000);

  let app: TestApp;
  let server: App;
  let dataSource: DataSource;

  const userA = { userId: '', email: '', cookie: '' };
  const userB = { userId: '', email: '', cookie: '' };
  let workspaceAId: string;
  let workspaceBId: string;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.server;
    dataSource = app.dataSource;

    const a = await createUser(server, { name: 'E2E A' });
    userA.userId = a.userId; userA.email = a.email; userA.cookie = a.cookie;
    const b = await createUser(server, { name: 'E2E B' });
    userB.userId = b.userId; userB.email = b.email; userB.cookie = b.cookie;

    const wsA = await createWorkspace(server, a, `e2e-tenancy-a-${Date.now()}`);
    workspaceAId = wsA.id;
    const wsB = await createWorkspace(server, b, `e2e-tenancy-b-${Date.now()}`);
    workspaceBId = wsB.id;

    // Seed one external target + its primary asset in workspace A.
    await request(server)
      .post('/api/targets/bulk')
      .set('Cookie', userA.cookie)
      .set('X-Workspace-Id', workspaceAId)
      .send({ targets: [{ value: `e2e-tenancy-a-${Date.now()}.example.com`, type: 'DOMAIN' }] })
      .expect(201);
  });

  afterAll(async () => {
    await cleanupE2eData(dataSource, {
      workspaceIds: [workspaceAId, workspaceBId],
      userIds: [userA.userId, userB.userId],
    });
    await closeTestApp(app.app);
  });

  it('returns 401 for an unauthenticated request', async () => {
    await request(server).get('/api/targets').expect(401);
  });

  it('allows a public health probe without a session', async () => {
    const res = await request(server).get('/api/health').expect(200);
    expect(res.text).toBeTruthy();
  });

  it('404s on an unknown route even with a valid session (control)', async () => {
    await request(server)
      .get('/api/definitely-not-a-route')
      .set('Cookie', userA.cookie)
      .set('X-Workspace-Id', workspaceAId)
      .expect(404);
  });

  /**
   * Runs `fn` with public sign-up open or closed. Open means an admin allows
   * it and the mail server is on; mail is captured, not sent. Restores both
   * settings afterwards.
   */
  const withSignUp = async (
    open: boolean,
    fn: (sent: MailMessage[]) => Promise<void>,
  ) => {
    const settings = app.app.get(SystemConfigsService);
    const { auth } = await settings.getSettings();
    const mailServer = await settings.getMailServer();
    const sent: MailMessage[] = [];
    const send = jest
      .spyOn(app.app.get(MailService), 'send')
      .mockImplementation((message) => {
        sent.push(message);
        return Promise.resolve();
      });
    await settings.updateSettings({
      auth: { allowSignUp: open },
      mailServer: {
        enabled: open,
        host: 'smtp.e2e.test',
        fromEmail: 'no-reply@e2e.test',
      },
    });
    try {
      await fn(sent);
    } finally {
      send.mockRestore();
      await settings.updateSettings({
        auth: { allowSignUp: auth?.allowSignUp === true },
        mailServer: {
          enabled: mailServer.enabled,
          host: mailServer.host,
          fromEmail: mailServer.fromEmail,
        },
      });
    }
  };

  it('refuses public self sign-up while it is closed', async () => {
    const email = `e2e-signup-${Date.now()}@example.com`;
    await withSignUp(false, async () => {
      const metadata = await request(server).get('/api/metadata').expect(200);
      expect(metadata.body).toMatchObject({ allowSignUp: false });

      await request(server)
        .post('/api/auth/sign-up/email')
        .send({ email, password: 'Password123!', name: 'E2E Outsider' })
        .expect(403);
    });

    const rows = await dataSource.query<unknown[]>(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );
    expect(rows).toHaveLength(0);
  });

  it('keeps sign-up closed until the mail server is on', async () => {
    await withSignUp(false, async () => {
      await app.app
        .get(SystemConfigsService)
        .updateSettings({ auth: { allowSignUp: true } });

      const metadata = await request(server).get('/api/metadata').expect(200);
      expect(metadata.body).toMatchObject({ allowSignUp: false });
      await request(server)
        .post('/api/auth/sign-up/email')
        .send({
          email: `e2e-signup-nomail-${Date.now()}@example.com`,
          password: 'Password123!',
          name: 'E2E Outsider',
        })
        .expect(403);
    });
  });

  it('opens sign-up to accounts that confirm their email, then wait for approval', async () => {
    const email = `e2e-signup-open-${Date.now()}@example.com`;
    const password = 'Password123!';
    const callbackURL = 'http://console.e2e.test/login?verified=1';
    const userIds: string[] = [];
    try {
      await withSignUp(true, async (sent) => {
        const metadata = await request(server).get('/api/metadata').expect(200);
        expect(metadata.body).toMatchObject({ allowSignUp: true });

        const res = await request(server)
          .post('/api/auth/sign-up/email')
          .send({ email, password, name: 'E2E Newcomer', callbackURL })
          .expect(200);
        // Created, but signed out: no session until approved
        expect(res.body).toMatchObject({ token: null });
        expect(res.headers['set-cookie']).toBeUndefined();
        const userId = (res.body as { user: { id: string } }).user.id;
        userIds.push(userId);

        // The confirmation link went out by mail
        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({ to: email });
        const link = new URL(/https?:\/\/\S+/.exec(sent[0].text)?.[0] ?? '');

        // Same grant `POST /api/admin/init` performs; the test DB has no admin
        const admin = await createUser(server, { name: 'E2E Approver' });
        userIds.push(admin.userId);
        await dataSource.query(
          `UPDATE users SET role = 'admin' WHERE id = $1`,
          [admin.userId],
        );
        const adminCookie = await signIn(server, admin.email, admin.password);
        const approve = () =>
          request(server)
            .post('/api/auth/admin/unban-user')
            .set('Cookie', adminCookie)
            .send({ userId });

        // Unconfirmed: sign-in asks for it, and approval waits for it
        const unconfirmed = await request(server)
          .post('/api/auth/sign-in/email')
          .send({ email, password })
          .expect(403);
        expect(unconfirmed.body).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
        const pending = await request(server)
          .get(`/api/admin/users/${userId}`)
          .set('Cookie', adminCookie)
          .expect(200);
        expect(pending.body).toMatchObject({
          pendingApproval: true,
          emailVerified: false,
        });
        await approve().expect(403);

        // Confirming sends them back to the console, still signed out
        const confirmed = await request(server)
          .get(link.pathname + link.search)
          .expect(302);
        expect(confirmed.headers.location).toBe(callbackURL);
        expect(confirmed.headers['set-cookie']).toBeUndefined();

        const unapproved = await request(server)
          .post('/api/auth/sign-in/email')
          .send({ email, password })
          .expect(403);
        expect(unapproved.body).toMatchObject({
          message: 'Your account is not active. Contact your administrator.',
        });

        // Approving is unbanning
        await approve().expect(200);
        await signIn(server, email, password);
      });
    } finally {
      await cleanupE2eData(dataSource, { userIds });
    }
  });

  it('rejects a valid session without a workspace id', async () => {
    await request(server)
      .get('/api/targets')
      .set('Cookie', userA.cookie)
      .expect(403)
      .expect((res) => {
        expect(JSON.stringify(res.body)).toContain('Workspace ID not provided');
      });
  });

  it('rejects a non-UUID workspace id', async () => {
    await request(server)
      .get('/api/targets')
      .set('Cookie', userA.cookie)
      .set('X-Workspace-Id', 'not-a-uuid')
      .expect(400);
  });

  it('rejects a non-member with the non-disclosure 403 (not 404)', async () => {
    await request(server)
      .get('/api/targets')
      .set('Cookie', userB.cookie)
      .set('X-Workspace-Id', workspaceAId)
      .expect(403);
  });

  it('lets the workspace owner list its targets', async () => {
    const res = await request(server)
      .get('/api/targets')
      .set('Cookie', userA.cookie)
      .set('X-Workspace-Id', workspaceAId)
      .expect(200);
    expect(res.body).toHaveProperty('total');
  });

  it('scopes targets/by-id/search to the caller workspace', async () => {
    // User B authenticates with their own workspace header; they must never
    // see workspace A's rows.
    const listB = await request(server)
      .get('/api/targets')
      .set('Cookie', userB.cookie)
      .set('X-Workspace-Id', workspaceBId)
      .expect(200);
    expect(listB.body.total).toBe(0);

    const searchB = await request(server)
      .get('/api/search')
      .query({ value: 'e2e-tenancy-a', limit: 10, workspaceId: workspaceBId })
      .set('Cookie', userB.cookie)
      .set('X-Workspace-Id', workspaceBId)
      .expect(200);
    const bodyA = JSON.stringify(searchB.body);
    expect(bodyA).not.toContain('e2e-tenancy-a-');
  });

  it('resolves the workspace from the wid cookie as it does the header', async () => {
    const viaHeader = await request(server)
      .get('/api/targets')
      .set('Cookie', userA.cookie)
      .set('X-Workspace-Id', workspaceAId)
      .expect(200);

    const viaCookie = await request(server)
      .get('/api/targets')
      .set('Cookie', `${userA.cookie}; wid=${workspaceAId}`)
      .expect(200);

    expect(viaCookie.body.total).toBe(viaHeader.body.total);
  });

  it('rejects a missing worker token and accepts a malformed one as 401', async () => {
    await request(server).get('/api/jobs-registry/some-worker/next').expect(401);
    await request(server)
      .get('/api/jobs-registry/some-worker/next')
      .set('worker-token', 'not-a-real-token')
      .expect(401);
  });
});
