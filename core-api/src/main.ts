import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import 'dotenv/config';
import { AppModule } from './app.module';
import { DEFAULT_PORT } from './common/constants/app.constants';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.set('query parser', 'extended');

  app.use(cookieParser());

  app.useGlobalPipes(new ValidationPipe());

  app.setGlobalPrefix('api', { exclude: ['/api/auth/{*path}', '/'] });

  const port = process.env.PORT ?? DEFAULT_PORT;
  await app.listen(port);

  const logger = new Logger('Application');
  logger.log(`Application is running on port ${port}`);
}
bootstrap();
