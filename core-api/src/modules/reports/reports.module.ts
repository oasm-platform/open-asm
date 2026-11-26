import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller';
import { Report } from './entities/report.entity';
import { ReportRunner } from './report-runner';
import { ReportsService } from './reports.service';
import { AttackSurfaceQueryModule } from '@/modules/attack-surface-query/attack-surface-query.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [TypeOrmModule.forFeature([Report]), AttackSurfaceQueryModule, StorageModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportRunner],
})
export class ReportsModule {}
