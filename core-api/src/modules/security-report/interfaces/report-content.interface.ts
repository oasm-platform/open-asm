export interface ExecutiveReportContent {
  summary: string;
  riskRating: string;
  top3Risks: {
    name: string;
    description: string;
    impact: string;
  }[];
  businessImpact: string;
  actionPlan: string;
}

export interface TechnicalReportContent {
  scope: string;
  architecture: string;
  vulnerabilitySummary: string;
  owaspCwe: string;
  components: string;
  roadmap: string;
}

export interface DeveloperVulnerability {
  name: string;
  description: string;
  severity: string;
  category: string;
  endpoint: string;
  reproduce: string;
  evidence: string;
  rootCause: string;
  fix: string;
}

export interface DeveloperReportContent {
  vulnerabilities: DeveloperVulnerability[];
}

export interface InfrastructureReportContent {
  assets: string;
  networkExposure: string;
  misconfig: string;
  tls: string;
  secrets: string;
  hardening: string;
}

export interface ReportCharts {
  severityDistribution?: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  coverageRadar?: {
    web: number;
    network: number;
    cloud: number;
    identity: number;
    tls: number;
  };
  categoryBreakdown?: {
    name: string;
    count: number;
  }[];
}

export interface ReportContent {
  executive?: ExecutiveReportContent;
  technical?: TechnicalReportContent;
  developer?: DeveloperReportContent;
  infrastructure?: InfrastructureReportContent;
  charts?: ReportCharts;
}
