import { ApiProperty } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

export class Top3RiskDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsString()
  impact: string;
}

export class ExecutiveReportContentDto {
  @ApiProperty()
  @IsString()
  summary: string;

  @ApiProperty()
  @IsString()
  riskRating: string;

  @ApiProperty({ type: [Top3RiskDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Top3RiskDto)
  top3Risks: Top3RiskDto[];

  @ApiProperty()
  @IsString()
  businessImpact: string;

  @ApiProperty()
  @IsString()
  actionPlan: string;
}

export class TechnicalReportContentDto {
  @ApiProperty()
  @IsString()
  scope: string;

  @ApiProperty()
  @IsString()
  architecture: string;

  @ApiProperty()
  @IsString()
  vulnerabilitySummary: string;

  @ApiProperty()
  @IsString()
  owaspCwe: string;

  @ApiProperty()
  @IsString()
  components: string;

  @ApiProperty()
  @IsString()
  roadmap: string;
}

export class DeveloperVulnerabilityDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsString()
  severity: string;

  @ApiProperty()
  @IsString()
  category: string;

  @ApiProperty()
  @IsString()
  endpoint: string;

  @ApiProperty()
  @IsString()
  reproduce: string;

  @ApiProperty()
  @IsString()
  evidence: string;

  @ApiProperty()
  @IsString()
  rootCause: string;

  @ApiProperty()
  @IsString()
  fix: string;
}

export class DeveloperReportContentDto {
  @ApiProperty({ type: [DeveloperVulnerabilityDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeveloperVulnerabilityDto)
  vulnerabilities: DeveloperVulnerabilityDto[];
}

export class InfrastructureReportContentDto {
  @ApiProperty()
  @IsString()
  assets: string;

  @ApiProperty()
  @IsString()
  networkExposure: string;

  @ApiProperty()
  @IsString()
  misconfig: string;

  @ApiProperty()
  @IsString()
  tls: string;

  @ApiProperty()
  @IsString()
  secrets: string;

  @ApiProperty()
  @IsString()
  hardening: string;
}

export class SeverityDistributionDto {
  @ApiProperty() @IsNumber() critical: number;
  @ApiProperty() @IsNumber() high: number;
  @ApiProperty() @IsNumber() medium: number;
  @ApiProperty() @IsNumber() low: number;
  @ApiProperty() @IsNumber() info: number;
}

export class CoverageRadarDto {
  @ApiProperty() @IsNumber() web: number;
  @ApiProperty() @IsNumber() network: number;
  @ApiProperty() @IsNumber() cloud: number;
  @ApiProperty() @IsNumber() identity: number;
  @ApiProperty() @IsNumber() tls: number;
}

export class CategoryBreakdownDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsNumber() count: number;
}

export class ReportChartsDto {
  @ApiProperty({ type: SeverityDistributionDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => SeverityDistributionDto)
  severityDistribution?: SeverityDistributionDto;

  @ApiProperty({ type: CoverageRadarDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => CoverageRadarDto)
  coverageRadar?: CoverageRadarDto;

  @ApiProperty({ type: [CategoryBreakdownDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryBreakdownDto)
  categoryBreakdown?: CategoryBreakdownDto[];
}

export class ReportContentDto {
  @ApiProperty({ type: ExecutiveReportContentDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExecutiveReportContentDto)
  executive?: ExecutiveReportContentDto;

  @ApiProperty({ type: TechnicalReportContentDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => TechnicalReportContentDto)
  technical?: TechnicalReportContentDto;

  @ApiProperty({ type: DeveloperReportContentDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeveloperReportContentDto)
  developer?: DeveloperReportContentDto;

  @ApiProperty({ type: InfrastructureReportContentDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => InfrastructureReportContentDto)
  infrastructure?: InfrastructureReportContentDto;

  @ApiProperty({ type: ReportChartsDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReportChartsDto)
  charts?: ReportChartsDto;
}
