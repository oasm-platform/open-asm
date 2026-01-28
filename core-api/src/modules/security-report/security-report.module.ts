import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecurityReport } from './entities/security-report.entity';
import { SecurityReportService } from './security-report.service';
import { SecurityReportController } from './security-report.controller';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { VulnerabilityDismissal } from '../vulnerabilities/entities/vulnerability-dismissal.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SecurityReport,
      Vulnerability,
      VulnerabilityDismissal,
    ]),
  ],
  controllers: [SecurityReportController],
  providers: [SecurityReportService],
  exports: [SecurityReportService],
})
export class SecurityReportModule {}
