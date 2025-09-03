import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import 'reflect-metadata';
import { AppModule } from './app.module';
import {
  APP_NAME,
  AUTH_INSTANCE_KEY,
  DEFAULT_PORT,
} from './common/constants/app.constants';
import { AuthGuard } from './common/guards/auth.guard';
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.set('query parser', 'extended');

  // Serve files from .storage directory
  app.useStaticAssets(path.join(__dirname, '..', '.storage'), {
    prefix: '/storage/',
    setHeaders: (res) => {
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

  const auth = app.get(AUTH_INSTANCE_KEY);

  app.useGlobalGuards(new AuthGuard(reflector, auth));

  // Configure cookie parser
  app.use(cookieParser());

  // Configure global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Configure global prefix
  app.setGlobalPrefix('api', { exclude: ['/api/auth/{*path}', '/'] });

  // Show Swagger UI in development: http://localhost:3000/api/docs
  const config = new DocumentBuilder()
    .setTitle(APP_NAME)
    .setDescription(
      'Open-source platform for cybersecurity Attack Surface Management (ASM)',
    )
    .setVersion('1.0')
    .setExternalDoc('Authentication Docs', 'auth/docs')
    .addGlobalParameters({
      in: 'header',
      required: false,
      schema: { type: 'string' },
      name: 'X-Workspace-Id',
    })
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, documentFactory, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const pathOutputOpenApi = '../open-api/open-api.json';
  fs.writeFileSync(pathOutputOpenApi, JSON.stringify(documentFactory()));

  // Start server
  const port = process.env.PORT ?? DEFAULT_PORT;
  await app.listen(port);

  const logger = new Logger('Application');
  logger.log(`Application is running on port ${port}`);
}

void bootstrap();
