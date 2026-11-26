import type { Severity, VulnerabilityAnalyzeStatus, JobStatus } from '@/common/enums/enum';
import type { TargetType } from '@/modules/targets/entities/target.entity';

type RiskLevel = Exclude<Severity, Severity.INFO>;

type ScanStatus = VulnerabilityAnalyzeStatus | Exclude<JobStatus, JobStatus.CANCELLED>;

type Trend = 'increasing' | 'decreasing' | 'stable';

interface WeeklyStats {
  totalTargets: number;
  targetsChange: number;
  targetsChangePercent: number;
  totalAssets: number;
  assetsChange: number;
  assetsChangePercent: number;
  totalServices: number;
  servicesChange: number;
  servicesChangePercent: number;
  securityScore: number;
  scoreChange: number;
  scoreChangePercent: number;
  activeVulns: number;
  vulnsChange: number;
  vulnsChangePercent: number;
  criticalVulns: number;
  criticalChange: number;
  criticalChangePercent: number;
  highVulns: number;
  mediumVulns: number;
  lowVulns: number;
  infoVulns: number;
  newVulns: number;
  resolvedVulns: number;
}

interface MonthlyStats extends WeeklyStats {
  scansCompleted: number;
}

interface VulnerabilityTrends {
  last7Days: number[];
  last30Days: number[];
  avgPerWeek: number;
  trend: Trend;
}

interface DiscoveryDomain {
  identifier: string;
  discovered: string;
  provider: string;
  riskLevel: RiskLevel;
}

interface DiscoveryIp {
  identifier: string;
  discovered: string;
  provider: string;
  riskLevel: RiskLevel;
}

interface DiscoveryPort {
  port: number;
  service: string;
  discovered: string;
  target: string;
  riskLevel: RiskLevel;
}

interface DiscoveryTechnology {
  name: string;
  discovered: string;
  target: string;
  category: string;
}

interface NewDiscoveries {
  domains: DiscoveryDomain[];
  ipAddresses: DiscoveryIp[];
  ports: DiscoveryPort[];
  technologies: DiscoveryTechnology[];
}

interface NewFinding {
  id: string;
  title: string;
  severity: Severity;
  cvss: number;
  asset: string;
  category: string;
  discovered: string;
  status: ScanStatus;
}

interface ResolvedFinding {
  id: string;
  title: string;
  resolved: string;
  daysOpen: number;
}

interface RiskDistribution {
  level: RiskLevel;
  count: number;
  percent: number;
  color: string;
}

interface Target {
  id: string;
  identifier: string;
  type: TargetType;
  status: ScanStatus;
  riskLevel: RiskLevel;
  provider: string;
  lastScan: string;
}

interface VulnerabilityByTarget {
  target: string;
  type: TargetType;
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

export interface ReportData {
  reportTitle: string;
  week: number;
  year: number;
  exportedAt: string;
  classification: string;
  systemName: string;
  workspaceName: string;
  formattedDate: string;
  weekPad: string;
  systemNameChar: string;
  logoBase64?: string;
  dateRange?: string;
  dateRangeLabel?: string;
  weekly: WeeklyStats;
  monthly: MonthlyStats;
  vulnerabilityTrends: VulnerabilityTrends;
  newDiscoveries: NewDiscoveries;
  newFindings: NewFinding[];
  resolvedFindings: ResolvedFinding[];
  riskDistribution: RiskDistribution[];
  targets: Target[];
  vulnerabilityByTarget: VulnerabilityByTarget[];
}
