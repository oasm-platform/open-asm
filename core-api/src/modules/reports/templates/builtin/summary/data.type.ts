import type { Severity } from '@/common/enums/enum';
import type { TargetType } from '@/modules/targets/entities/target.entity';

type RiskLevel = Exclude<Severity, Severity.INFO>;

type Trend = 'increasing' | 'decreasing' | 'stable';

interface WeeklyStats {
  totalTargets: number;
  targetsChange: number;
  totalAssets: number;
  assetsChange: number;
  totalServices: number;
  servicesChange: number;
  securityScore: number;
  scoreChange: number;
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
  title: string;
  severity: Severity;
  cvss: number;
  asset: string;
  discovered: string;
}

interface RiskDistribution {
  level: RiskLevel;
  count: number;
  percent: number;
  color: string;
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
  vulnerabilityTrends: VulnerabilityTrends;
  newDiscoveries: NewDiscoveries;
  newFindings: NewFinding[];
  riskDistribution: RiskDistribution[];
  vulnerabilityByTarget: VulnerabilityByTarget[];
}
