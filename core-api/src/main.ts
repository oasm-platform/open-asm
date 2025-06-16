import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import 'dotenv/config';
import { AppModule } from './app.module';
import { DEFAULT_PORT } from './common/constants/app.constants';
import * as cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.set('query parser', 'extended');

  app.use(cookieParser());

  app.useGlobalPipes(new ValidationPipe());

  app.setGlobalPrefix('api', { exclude: ['/api/auth/{*path}', '/'] });

  // Show Swagger UI in development: http://localhost:3000/api/swagger
  const config = new DocumentBuilder()
    .setTitle('OASM API')
    .setDescription(
      'Open-source platform for cybersecurity Attack Surface Management (ASM)',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'Bearer',
        bearerFormat: 'JWT',
        in: 'header',
      },
      'token',
    )
    .addSecurityRequirements('token')
    .setVersion('1.0')
    .addTag('OASM API')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/swagger', app, documentFactory, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = process.env.PORT ?? DEFAULT_PORT;
  await app.listen(port);

  const logger = new Logger('Application');
  logger.log(`Application is running on port ${port}`);
}
bootstrap();
