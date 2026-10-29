import { API_GLOBAL_PREFIX, AUTH_INSTANCE_KEY, CACHE_STATIC_RESOURCE } from '@/common/constants/app.constants';
import { AuthGuard } from '@/common/guards/auth.guard';
import { requestIdMiddleware } from '@/common/middleware/request-id.middleware';
import { UserPresenceService } from '@/modules/auth/user-presence.service';
import { ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NodeAdapter } from '@nestjs/platform-node';
import type { NestNodeApplication, NodeResponse } from '@nestjs/platform-node';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import * as path from 'path';
import { parse as parseQueryString } from 'qs';

/**
 * Creates the HTTP adapter `main.ts` and the e2e harness both boot on, so the
 * options below are exercised by the tests too.
 *
 * - Query strings are parsed with `qs`, with the options Express' "extended"
 *   query parser used, so `?ids=a&ids=b` and `?filter[x]=1` keep arriving as
 *   an array and a nested object (the adapter's default parser keeps
 *   `filter[x]` as a flat key).
 * - Route parameters may be up to 256 characters instead of the adapter's
 *   default 100: some are user-chosen names (e.g. `mcp-configs/:name`) with no
 *   length limit of their own, and a longer one would get a 414.
 */
export function createHttpAdapter(): NodeAdapter {
  return new NodeAdapter({
    querystringParser: (query) => parseQueryString(query, { allowPrototypes: true }),
    maxParamLength: 256,
  });
}

/**
 * Applies the HTTP layer every request goes through: request-id propagation,
 * static assets, CORS, the global auth guard, cookie parsing, compression,
 * validation, and the `/api` prefix.
 *
 * Extracted from `main.ts` so the e2e harness boots the exact same chain the
 * production server does. A test that re-derives this configuration is testing
 * a router that no deployment runs — the guard/prefix/pipe drift between
 * `main.ts` and a hand-written spec bootstrap is silent and produces false
 * confidence.
 *
 * Deliberately excludes everything that belongs to the *process* rather than
 * the request, so a test can boot it safely:
 *   - the Swagger/Scalar document and the `.open-api/open-api.json` write
 *     (that file is generated and git-tracked — a test run must not dirty it),
 *   - the gRPC microservice, which binds a fixed port and would collide with a
 *     locally running API,
 *   - `app.listen`.
 */
export function configureApp(app: NestNodeApplication): void {
  // First in the chain so every downstream middleware/guard/handler and the
  // audit log share the same requestId (X-Request-Id round-trip).
  app.use(requestIdMiddleware);

  app.useStaticAssets(path.join(__dirname, '..', '..', 'public'), {
    prefix: '/api/static/',
    setHeaders: (res: NodeResponse) => {
      res.set('Cache-Control', `max-age=${CACHE_STATIC_RESOURCE}, no-transform`);
    },
  });

  // Configure CORS
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Configure global guards
  app.useGlobalGuards(
    new AuthGuard(
      app.get(Reflector),
      app.get(AUTH_INSTANCE_KEY),
      app.get(UserPresenceService),
    ),
  );

  // Configure cookie parser
  app.use(cookieParser());

  // Compress responses — skip SSE streams to preserve real-time streaming
  app.use(
    compression({
      filter: (req, res) => {
        const contentType = res.getHeader('Content-Type');
        if (contentType && contentType.toString().includes('text/event-stream')) {
          return false;
        }
        return compression.filter(req, res);
      },
    }),
  );

  // Configure global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Configure global prefix
  app.setGlobalPrefix(API_GLOBAL_PREFIX, {
    exclude: [`/${API_GLOBAL_PREFIX}/auth/{*path}`, '/'],
  });
}
