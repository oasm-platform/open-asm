import { AppModule } from '@/app.module';
import { BullMQName } from '@/common/enums/enum';
import { configureApp } from '@/bootstrap/configure-app';
import { getQueueToken } from '@nestjs/bullmq';
import type { INestApplication } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import { DataSource } from 'typeorm';

export interface TestApp {
  app: INestApplication;
  /** Passed straight to supertest's `request()`. */
  server: Server;
  dataSource: DataSource;
}

/**
 * Boots `AppModule` behind the *real* HTTP pipeline.
 *
 * `configureApp` is the same function `main.ts` calls, so the prefix, the
 * `AuthGuard`, the `ValidationPipe` and the middleware order under test are
 * exactly what production runs. What is left out is process-level: no Swagger
 * document, no `.open-api/open-api.json` write (that file is generated and
 * git-tracked, so a test run must not dirty it), and no gRPC server (it binds
 * the fixed port 16276 and would collide with a locally running API).
 */
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>(
    new ExpressAdapter(),
    // Mirrors `main.ts`. better-auth needs the raw stream, and
    // `SkipBodyParsingMiddleware` re-enables JSON parsing for every other
    // route, so request bodies still arrive.
    { bodyParser: false, logger: false },
  );

  configureApp(app);
  await app.init();

  // Crons start firing the moment the app initialises. The 2-minute workflow
  // reconciler would mutate job history underneath a spec asserting on it, so
  // stop all scheduled work before the first test runs.
  stopScheduledWork(app);

  return {
    app,
    server: app.getHttpServer(),
    dataSource: app.get(DataSource),
  };
}

/**
 * Stops every cron, interval and timeout the app registered.
 *
 * `ScheduleModule.forRoot()` owns these and `app.close()` does not clear the
 * timers it created, so a cron that fires every two minutes keeps firing —
 * and keeps the event loop alive — after teardown.
 */
export function stopScheduledWork(app: INestApplication): void {
  const registry = app.get(SchedulerRegistry, { strict: false });

  for (const name of [...registry.getCronJobs().keys()]) {
    registry.deleteCronJob(name);
  }
  for (const name of registry.getIntervals()) {
    registry.deleteInterval(name);
  }
  for (const name of registry.getTimeouts()) {
    registry.deleteTimeout(name);
  }
}

/**
 * Closes every registered BullMQ queue.
 *
 * Each queue owns an ioredis connection, and `app.close()` does not close
 * them — an open redis socket is exactly what makes Jest report
 * "A worker process has failed to exit gracefully". Enumerating `BullMQName`
 * rather than a literal list means a queue added later is picked up here
 * automatically instead of silently reintroducing the leak.
 */
export async function closeBullQueues(app: INestApplication): Promise<void> {
  for (const name of Object.values(BullMQName)) {
    // Only queues a module actually registered resolve; the rest throw on
    // `get`, and a missing queue must not fail teardown.
    let queue: { close(): Promise<void> } | undefined;
    try {
      queue = app.get<{ close(): Promise<void> }>(
        getQueueToken(name),
        { strict: false },
      );
    } catch {
      continue;
    }
    await queue?.close();
  }
}

/**
 * Full teardown: stop timers, close redis-backed queues, close the container.
 *
 * Order matters — scheduled work is stopped first so nothing can enqueue onto
 * a queue while that queue is closing.
 */
export async function closeTestApp(
  app: INestApplication | undefined,
): Promise<void> {
  if (!app) return;
  try {
    stopScheduledWork(app);
    await closeBullQueues(app);
  } finally {
    await app.close();
  }
}