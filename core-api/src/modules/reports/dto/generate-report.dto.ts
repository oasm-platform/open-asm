import { IsString, IsNumber, IsObject, IsOptional } from 'class-validator';

class WeeklyDataDto {
  @IsNumber() totalTargets: number;
  @IsNumber() targetsChange: number;
  @IsNumber() targetsChangePercent: number;
  @IsNumber() totalAssets: number;
  @IsNumber() assetsChange: number;
  @IsNumber() assetsChangePercent: number;
  @IsNumber() totalServices: number;
  @IsNumber() servicesChange: number;
  @IsNumber() servicesChangePercent: number;
  @IsNumber() securityScore: number;
  @IsNumber() scoreChange: number;
  @IsNumber() scoreChangePercent: number;
  @IsNumber() activeVulns: number;
  @IsNumber() vulnsChange: number;
  @IsNumber() vulnsChangePercent: number;
  @IsNumber() criticalVulns: number;
  @IsNumber() criticalChange: number;
  @IsNumber() criticalChangePercent: number;
  @IsNumber() highVulns: number;
  @IsNumber() mediumVulns: number;
  @IsNumber() lowVulns: number;
  @IsNumber() infoVulns: number;
  @IsNumber() newVulns: number;
  @IsNumber() resolvedVulns: number;
}

class MonthlyDataDto extends WeeklyDataDto {
  @IsNumber() scansCompleted: number;
  @IsString() avgScanTime: string;
}

class VulnerabilityTrendsDto {
  @IsObject() last7Days: number[];
  @IsObject() last30Days: number[];
  @IsNumber() avgPerWeek: number;
  @IsString() trend: string;
}

class NewFindingsDto {
  @IsString() id: string;
  @IsString() title: string;
  @IsString() severity: string;
  @IsNumber() cvss: number;
  @IsString() asset: string;
  @IsString() category: string;
  @IsString() discovered: string;
  @IsString() status: string;
}

class ResolvedFindingsDto {
  @IsString() id: string;
  @IsString() title: string;
  @IsString() resolved: string;
  @IsNumber() daysOpen: number;
}

class DomainDto {
  @IsString() identifier: string;
  @IsString() discovered: string;
  @IsString() provider: string;
  @IsString() riskLevel: string;
}

class IpAddressDto {
  @IsString() identifier: string;
  @IsString() discovered: string;
  @IsString() provider: string;
  @IsString() riskLevel: string;
}

class PortDto {
  @IsNumber() port: number;
  @IsString() service: string;
  @IsString() discovered: string;
  @IsString() target: string;
  @IsString() riskLevel: string;
}

class TechnologyDto {
  @IsString() name: string;
  @IsString() discovered: string;
  @IsString() target: string;
  @IsString() category: string;
}

class NewDiscoveriesDto {
  @IsObject() domains: DomainDto[];
  @IsObject() ipAddresses: IpAddressDto[];
  @IsObject() ports: PortDto[];
  @IsObject() technologies: TechnologyDto[];
}

class TargetDto {
  @IsString() id: string;
  @IsString() identifier: string;
  @IsString() type: string;
  @IsString() status: string;
  @IsString() riskLevel: string;
  @IsString() provider: string;
  @IsString() lastScan: string;
}

class VulnerabilityByTargetDto {
  @IsString() target: string;
  @IsString() type: string;
  @IsNumber() critical: number;
  @IsNumber() high: number;
  @IsNumber() medium: number;
  @IsNumber() low: number;
  @IsNumber() total: number;
}

class RiskDistributionDto {
  @IsString() level: string;
  @IsNumber() count: number;
  @IsNumber() percent: number;
  @IsString() color: string;
}

export class GenerateReportDto {
  @IsString() reportTitle: string;
  @IsNumber() week: number;
  @IsNumber() year: number;
  @IsString() exportedAt: string;
  @IsString() classification: string;

  @IsObject() weekly: WeeklyDataDto;
  @IsObject() monthly: MonthlyDataDto;
  @IsObject() vulnerabilityTrends: VulnerabilityTrendsDto;

  @IsObject() newFindings: NewFindingsDto[];
  @IsObject() resolvedFindings: ResolvedFindingsDto[];
  @IsObject() newDiscoveries: NewDiscoveriesDto;

  @IsObject() targets: TargetDto[];
  @IsObject() vulnerabilityByTarget: VulnerabilityByTargetDto[];
  @IsObject() riskDistribution: RiskDistributionDto[];

  @IsOptional()
  @IsString()
  logoPath?: string;

  @IsOptional()
  @IsString()
  systemName?: string;
}