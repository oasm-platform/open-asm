import { ReflectionService } from '@grpc/reflection';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { Transport } from '@nestjs/microservices';
import type {
  NestNodeApplication,
  NodeRequest,
  NodeResponse,
} from '@nestjs/platform-node';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { join } from 'path';
import 'reflect-metadata';
import { AppModule } from './app.module';
import { configureApp, createHttpAdapter } from './bootstrap/configure-app';
import {
  API_GLOBAL_PREFIX,
  APP_NAME,
  DEFAULT_GRPC_PORT,
  DEFAULT_PORT,
} from './common/constants/app.constants';
import { mergeBetterAuthSpec } from './utils/mergeBetterAuth';
async function bootstrap() {
  const app = await NestFactory.create<NestNodeApplication>(
    AppModule,
    createHttpAdapter(),
    {
      bodyParser: false,
      logger: ['log', 'error', 'warn', 'verbose'],
    },
  );
  configureApp(app);

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

  const renderApiReference = apiReference({
    content: documentFactory(),
    darkMode: true,
  }) as (req: NodeRequest, res: NodeResponse) => void;
  // Scalar replies with res.send(html), which the Node adapter sends as
  // text/plain unless a Content-Type is already set.
  app.use(
    `/${API_GLOBAL_PREFIX}/docs`,
    (req: NodeRequest, res: NodeResponse) => {
      res.type('html');
      renderApiReference(req, res);
    },
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
        includeDirs: [join(__dirname, 'proto')],
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
