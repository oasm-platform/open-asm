import { API_GLOBAL_PREFIX, AUTH_INSTANCE_KEY, CACHE_STATIC_RESOURCE } from '@/common/constants/app.constants';
import {
  DEFAULT_CORS_ALLOWED_ORIGINS,
  parseAllowedOrigins,
} from '@/common/config/allowed-origins';
import { AuthGuard } from '@/common/guards/auth.guard';
import { requestIdMiddleware } from '@/common/middleware/request-id.middleware';
import { Logger, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import type { Response } from 'express';
import * as path from 'path';

/**
 * Applies the HTTP layer every request goes through: query parser, request-id
 * propagation, static assets, CORS, the global auth guard, cookie parsing,
 * compression, validation, and the `/api` prefix.
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
export function configureApp(app: NestExpressApplication): void {
  app.set('query parser', 'extended');

  // First in the chain so every downstream middleware/guard/handler and the
  // audit log share the same requestId (X-Request-Id round-trip).
  app.use(requestIdMiddleware);

  app.useStaticAssets(path.join(__dirname, '..', '..', 'public'), {
    prefix: '/api/static/',
    setHeaders: (res: Response) => {
      res.set('Cache-Control', `max-age=${CACHE_STATIC_RESOURCE}, no-transform`);
    },
  });

  // Configure CORS
  if (!process.env.CORS_ALLOWED_ORIGINS) {
    new Logger('CorsConfig').warn(
      'CORS_ALLOWED_ORIGINS is unset, falling back to localhost defaults',
    );
  }
  app.enableCors({
    origin: parseAllowedOrigins(
      process.env.CORS_ALLOWED_ORIGINS,
      DEFAULT_CORS_ALLOWED_ORIGINS,
    ),
    credentials: true,
  });

  // Configure global guards
  app.useGlobalGuards(new AuthGuard(app.get(Reflector), app.get(AUTH_INSTANCE_KEY)));

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