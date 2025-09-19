import { Module } from '@nestjs/common';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Template } from './entities/templates.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Template]), WorkspacesModule],
  controllers: [TemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
