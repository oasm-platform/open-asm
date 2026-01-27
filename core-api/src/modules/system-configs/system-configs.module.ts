import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemConfig } from './entities/system-config.entity';
import { SystemConfigsController } from './system-configs.controller';
import { SystemConfigsService } from './system-configs.service';

/**
 * Module for system configuration management
 */
@Module({
  imports: [TypeOrmModule.forFeature([SystemConfig])],
  controllers: [SystemConfigsController],
  providers: [SystemConfigsService],
  exports: [SystemConfigsService],
})
export class SystemConfigsModule {}
