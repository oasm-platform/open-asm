import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import 'dotenv/config';
import { AppModule } from './app.module';
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.set('query parser', 'extended');

  app.setGlobalPrefix('api', { exclude: ['/api/auth/{*path}'] });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
