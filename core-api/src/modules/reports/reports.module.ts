import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller';
import { Report } from './entities/report.entity';
import { ReportsService } from './reports.service';
import { VulnerabilityReportService } from './services/vulnerability-report.service';
import { SummaryReportService } from './services/summary-report.service';
import { Vulnerability } from '@/modules/vulnerabilities/entities/vulnerability.entity';
import { Target } from '@/modules/targets/entities/target.entity';
import { AssetService } from '@/modules/assets/entities/asset-services.entity';
import { AssetTag } from '@/modules/assets/entities/asset-tags.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { StatisticModule } from '@/modules/statistic/statistic.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Report, Vulnerability, Target, AssetService, AssetTag, Workspace]),
    StatisticModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService, VulnerabilityReportService, SummaryReportService],
})
export class ReportsModule {}
