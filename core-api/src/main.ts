import { ReflectionService } from '@grpc/reflection';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { Transport } from '@nestjs/microservices';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import 'dotenv/config';
import type { Response } from 'express';
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
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: ['log', 'error', 'warn', 'verbose'],
  });
  app.set('query parser', 'extended');

  app.useStaticAssets(path.join(__dirname, '..', 'public'), {
    prefix: '/api/static/',
    setHeaders: (res: Response) => {
      res.set(
        'Cache-Control',
        `max-age=${CACHE_STATIC_RESOURCE}, no-transform`,
      );
    },
  });

  // Configure CORS
  app.enableCors({
    origin: true,
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
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
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
