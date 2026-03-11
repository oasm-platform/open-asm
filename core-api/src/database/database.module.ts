import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from './database-config';
import { DatabaseService } from './database.service';

@Global()
@Module({
  imports: [TypeOrmModule.forRoot(dataSourceOptions)],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
