import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import 'dotenv/config';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import 'reflect-metadata';
import { AppModule } from './app.module';
import {
  API_GLOBAL_PREFIX,
  APP_NAME,
  AUTH_INSTANCE_KEY,
  DEFAULT_PORT,
} from './common/constants/app.constants';
import { AuthGuard } from './common/guards/auth.guard';
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: ['log', 'error', 'warn', 'verbose'],
  });
  app.set('query parser', 'extended');

  // Serve files from .storage directory
  app.useStaticAssets(path.join(__dirname, '..', '.storage'), {
    prefix: '/storage/',
    setHeaders: (res: Response) => {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    },
  });

  app.useStaticAssets(path.join(__dirname, '..', 'public'), {
    prefix: '/api/static/',
    setHeaders: (res: Response) => {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
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
  // Compress responses
  app.use(compression());
  // Configure global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Configure global prefix
  app.setGlobalPrefix(API_GLOBAL_PREFIX, { exclude: [`/${API_GLOBAL_PREFIX}/auth/{*path}`, '/'] });

  // Show Swagger UI in development: http://localhost:3000/api/docs
  const config = new DocumentBuilder()
    .setTitle(APP_NAME)
    .setDescription(
      'Open-source platform for cybersecurity Attack Surface Management (ASM)',
    )
    .setVersion('1.0')
    .setExternalDoc('Authentication Docs', 'auth/docs')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${API_GLOBAL_PREFIX}/docs`, app, documentFactory, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const pathOutputOpenApi = '../.open-api/open-api.json';

  // Create directory if it doesn't exist
  const directoryPath = path.dirname(pathOutputOpenApi);
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }

  fs.writeFileSync(pathOutputOpenApi, JSON.stringify(documentFactory()));

  // Start server
  const port = process.env.PORT ?? DEFAULT_PORT;
  await app.listen(port);

  const logger = new Logger('Application');
  logger.log(`Application is running on port ${port}`);
}

void bootstrap();
