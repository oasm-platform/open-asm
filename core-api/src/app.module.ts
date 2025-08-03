import { ToolsModule } from './modules/tools/tools.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { CombineModule } from './modules/combine.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: `.env`,
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    CombineModule,
    ToolsModule,
  ],
})
export class AppModule {}
