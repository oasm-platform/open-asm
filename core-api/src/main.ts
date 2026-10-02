import { ReflectionService } from '@grpc/reflection';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { Transport } from '@nestjs/microservices';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import 'dotenv/config';
import type { RequestHandler, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { join } from 'path';
import 'reflect-metadata';
import { AppModule } from './app.module';
import {
  API_GLOBAL_PREFIX,
  APP_NAME,
  AUTH_INSTANCE_KEY,
  CACHE_STATIC_RESOURCE,
  DEFAULT_GRPC_PORT,
  DEFAULT_PORT,
} from './common/constants/app.constants';
import { AuthGuard } from './common/guards/auth.guard';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { mergeBetterAuthSpec } from './utils/mergeBetterAuth';

/**
 * Origins permitted to make credentialed cross-origin requests.
 *
 * SECURITY: `app.enableCors({ origin: true, ... })` reflected whatever Origin
 * the client sent, and paired it with `Access-Control-Allow-Credentials: true`
 * — any site could read authenticated API responses. `['*']` does not fix
 * that: better-auth's own `enableCors` is registered later in the Express
 * stack and, with `cors@2.8.x`, an array is not treated as literal `*`, so it
 * omits the header instead of overwriting the reflected one.
 *
 * TRUSTED_ORIGINS is a comma-separated allow-list. Empty (the default) means
 * no cross-origin credentialed access at all, which is correct for the
 * bundled console served same-origin.
 */
function resolveCorsOrigins(): string[] {
  const raw = process.env.TRUSTED_ORIGINS?.trim();
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Baseline security response headers.
 *
 * The API previously sent none of these: no `X-Frame-Options` (the Scalar
 * docs page was frameable / clickjackable), no `X-Content-Type-Options`
 * (MIME sniffing), no HSTS, no `Referrer-Policy`.
 */
function securityHeaders(): RequestHandler {
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    // HSTS only over TLS; sending it on plain HTTP is ignored by browsers
    // and would be misleading.
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
      );
    }
    next();
  };
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: ['log', 'error', 'warn', 'verbose'],
  });
  app.set('query parser', 'extended');

  // First in the chain so every downstream middleware/guard/handler and the
  // audit log share the same requestId (X-Request-Id round-trip).
  app.use(requestIdMiddleware);

  app.useStaticAssets(path.join(__dirname, '..', 'public'), {
    prefix: '/api/static/',
    setHeaders: (res: Response) => {
      res.set(
        'Cache-Control',
        `max-age=${CACHE_STATIC_RESOURCE}, no-transform`,
      );
    },
  });

  // Security headers. Implemented directly rather than pulling in `helmet`
  // (a dependency bump needs sign-off per AGENTS.md); these cover the same
  // defaults that mattered for this app. Registered first so headers are
  // present on every response, including the docs page and error paths.
  app.use(securityHeaders());

  // Configure CORS
  // SECURITY: `origin: true` reflects the request's Origin back in
  // Access-Control-Allow-Origin together with Access-Control-Allow-Credentials,
  // which let ANY origin issue credentialed requests (verified: a victim's
  // member list was returned to an arbitrary Origin). Use an explicit
  // allow-list driven by TRUSTED_ORIGINS instead.
  const corsOrigins = resolveCorsOrigins();
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
  });

  // Configure global guards
  const reflector = app.get(Reflector);

  app.useGlobalGuards(new AuthGuard(reflector, app.get(AUTH_INSTANCE_KEY)));

  // Configure cookie parser
  app.use(cookieParser());
  // Compress responses — skip SSE streams to preserve real-time streaming
  app.use(
    compression({
      filter: (req, res) => {
        const contentType = res.getHeader('Content-Type');
        if (
          contentType &&
          contentType.toString().includes('text/event-stream')
        ) {
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

  // API docs at http://localhost:6276/api/docs (Scalar)
  const config = new DocumentBuilder()
    .setTitle(APP_NAME)
    .setDescription(
      'Open-source platform for cybersecurity Attack Surface Management (ASM)',
    )
    .setVersion('1.0')
    .setExternalDoc('Authentication Docs', 'auth/docs')
    .addTag('Admin')
    .addTag('Authentication')
    .build();

  const documentFactory = () =>
    mergeBetterAuthSpec(SwaggerModule.createDocument(app, config));

  app.use(
    `/${API_GLOBAL_PREFIX}/docs`,
    apiReference({
      content: documentFactory(),
      darkMode: true,
    }),
  );

  const pathOutputOpenApi = '../.open-api/open-api.json';

  // Create directory if it doesn't exist
  const directoryPath = path.dirname(pathOutputOpenApi);
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }

  fs.writeFileSync(pathOutputOpenApi, JSON.stringify(documentFactory()));
  const grpcPort = process.env.GRPC_PORT ?? DEFAULT_GRPC_PORT;
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: ['workers', 'jobs_registry'],
      protoPath: [
        join(__dirname, 'proto/workers.proto'),
        join(__dirname, 'proto/jobs_registry.proto'),
      ],
      url: `0.0.0.0:${grpcPort}`,
      loader: {
        keepCase: false,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      },
      onLoadPackageDefinition: (pkg, server) => {
        const reflection = new ReflectionService(pkg);
        reflection.addToServer(server);
      },
      maxReceiveMessageLength: 64 * 1024 * 1024,
      maxSendMessageLength: 64 * 1024 * 1024,
    },
  });

  const logger = new Logger('Application');

  // Start server
  await app.startAllMicroservices();

  const port = process.env.PORT ?? DEFAULT_PORT;
  await app.listen(port);
  logger.log(`gRPC server is running on port ${grpcPort}`);
  logger.log(`Application is running on port ${port}`);
}

void bootstrap();
