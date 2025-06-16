import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { CombineModule } from './modules/combine.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: `.env`,
      isGlobal: true,
    }),
    DatabaseModule,
    CombineModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
