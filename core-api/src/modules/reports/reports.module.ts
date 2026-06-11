import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller';
import { Report } from './entities/report.entity';
import { ReportsService } from './reports.service';
import { VulnerabilityReportService } from './services/vulnerability-report.service';
import { Vulnerability } from '@/modules/vulnerabilities/entities/vulnerability.entity';
import { Asset } from '@/modules/assets/entities/assets.entity';
import { Target } from '@/modules/targets/entities/target.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Report, Vulnerability, Asset, Target]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService, VulnerabilityReportService],
})
export class ReportsModule {}
