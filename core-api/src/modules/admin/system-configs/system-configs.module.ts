import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemConfig } from './entities/system-config.entity';
import { MailService } from './mail.service';
import { SignUpHook } from './sign-up.hook';
import { SystemConfigsController } from './system-configs.controller';
import { SystemConfigsService } from './system-configs.service';
import { StorageModule } from '../../storage/storage.module';

/**
 * Module for system configuration management
 */
@Module({
  imports: [TypeOrmModule.forFeature([SystemConfig]), StorageModule],
  controllers: [SystemConfigsController],
  providers: [SystemConfigsService, SignUpHook, MailService],
  exports: [SystemConfigsService],
})
export class SystemConfigsModule {}
