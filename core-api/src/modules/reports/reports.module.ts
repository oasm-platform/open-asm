import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullMQName } from '@/common/enums/enum';
import { ReportsController } from './reports.controller';
import { Report } from './entities/report.entity';
import { ReportSchedule } from './entities/report-schedule.entity';
import { ReportRunner } from './report-runner';
import { ReportsService } from './reports.service';
import { ReportGenerateProcessor, ReportScheduleProcessor } from './report.processors';
import { AttackSurfaceQueryModule } from '@/modules/attack-surface-query/attack-surface-query.module';
import { ArtifactsModule } from '../artifacts/artifacts.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Report, ReportSchedule]),
    BullModule.registerQueue(
      { name: BullMQName.REPORT_GENERATE, defaultJobOptions: { attempts: 1, removeOnComplete: 100, removeOnFail: 100 } },
      { name: BullMQName.REPORT_SCHEDULE, defaultJobOptions: { attempts: 1, removeOnComplete: 100, removeOnFail: 100 } },
    ),
    AttackSurfaceQueryModule,
    ArtifactsModule,
    StorageModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService, ReportRunner, ReportGenerateProcessor, ReportScheduleProcessor],
})
export class ReportsModule {}
