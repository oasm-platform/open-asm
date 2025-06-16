import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
})
export class AppModule {}
