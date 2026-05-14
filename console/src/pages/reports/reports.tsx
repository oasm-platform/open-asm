import Page from '@/components/common/page';
import { Button } from '@/components/ui/button';
import Logo from '@/components/ui/logo';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import {
  getRootControllerGetMetadataQueryKey,
  useRootControllerGetMetadata,
} from '@/services/apis/gen/queries';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bug,
  CheckCircle,
  Clock,
  Cloud,
  Database,
  Download,
  Eye,
  Globe2,
  Lock,
  Server,
  Shield,
  Target,
  TrendingDown,
} from 'lucide-react';
import CreateWorkspace from '../workspaces/create-workspace';

const fakeReportsData = {
  reportTitle: 'Attack Surface Discovery Report',
  week: 19,
  year: 2026,
  exportedAt: '2026-05-11T17:00:00Z',
  classification: 'Strictly Confidential',

  weekly: {
    totalTargets: 1452,
    targetsChange: 12,
    targetsChangePercent: 0.8,
    totalAssets: 3450,
    assetsChange: 45,
    assetsChangePercent: 1.3,
    totalServices: 892,
    servicesChange: -23,
    servicesChangePercent: -2.5,
    securityScore: 8.2,
    scoreChange: 0.3,
    scoreChangePercent: 3.8,
    activeVulns: 28,
    vulnsChange: -8,
    vulnsChangePercent: -22.2,
    criticalVulns: 3,
    criticalChange: -2,
    criticalChangePercent: -40,
    highVulns: 12,
    mediumVulns: 8,
    lowVulns: 5,
    infoVulns: 0,
    newVulns: 5,
    resolvedVulns: 13,
  },

  monthly: {
    totalTargets: 1452,
    targetsChange: 45,
    targetsChangePercent: 3.2,
    totalAssets: 3450,
    assetsChange: 120,
    assetsChangePercent: 3.6,
    totalServices: 892,
    servicesChange: -56,
    servicesChangePercent: -5.9,
    securityScore: 8.2,
    scoreChange: 0.6,
    scoreChangePercent: 7.9,
    activeVulns: 28,
    vulnsChange: -15,
    vulnsChangePercent: -34.9,
    criticalVulns: 3,
    criticalChange: -5,
    criticalChangePercent: -62.5,
    highVulns: 12,
    mediumVulns: 8,
    lowVulns: 5,
    infoVulns: 0,
    newVulns: 18,
    resolvedVulns: 33,
    scansCompleted: 12,
    avgScanTime: '2h 15m',
  },

  vulnerabilityTrends: {
    last7Days: [32, 28, 35, 30, 25, 22, 28],
    last30Days: [
      45, 42, 48, 52, 55, 50, 45, 42, 38, 35, 32, 30, 28, 30, 35, 40, 38, 35,
      32, 30, 28, 30, 32, 35, 33, 30, 28, 30, 32, 28,
    ],
    avgPerWeek: 24,
    trend: 'decreasing',
  },

  newFindings: [
    {
      id: 'VULN-001',
      title: 'Remote Code Execution in Apache Struts',
      severity: 'critical',
      cvss: 9.8,
      asset: 'api-v2.example.com',
      category: 'Web Application',
      discovered: '2026-05-09',
      status: 'not_analyzed',
    },
    {
      id: 'VULN-002',
      title: 'SQL Injection in Legacy API',
      severity: 'high',
      cvss: 8.2,
      asset: 'api.example.com/v1',
      category: 'API',
      discovered: '2026-05-08',
      status: 'running',
    },
    {
      id: 'VULN-003',
      title: 'Cross-Site Scripting in Admin Panel',
      severity: 'medium',
      cvss: 6.1,
      asset: 'admin.example.com',
      category: 'Web Application',
      discovered: '2026-05-07',
      status: 'not_analyzed',
    },
    {
      id: 'VULN-004',
      title: 'Exposed Docker Socket',
      severity: 'critical',
      cvss: 9.1,
      asset: '10.50.12.44',
      category: 'Infrastructure',
      discovered: '2026-05-06',
      status: 'running',
    },
    {
      id: 'VULN-005',
      title: 'Weak SSH Password Policy',
      severity: 'medium',
      cvss: 5.3,
      asset: 'dev-srv-01',
      category: 'Access Control',
      discovered: '2026-05-05',
      status: 'not_analyzed',
    },
    {
      id: 'VULN-006',
      title: 'Subdomain Takeover',
      severity: 'high',
      cvss: 7.5,
      asset: 'campaign-test.example.com',
      category: 'DNS',
      discovered: '2026-05-04',
      status: 'not_analyzed',
    },
    {
      id: 'VULN-007',
      title: 'Unencrypted S3 Bucket',
      severity: 'high',
      cvss: 7.4,
      asset: 'archive-bucket-99',
      category: 'Data Storage',
      discovered: '2026-05-03',
      status: 'not_analyzed',
    },
    {
      id: 'VULN-008',
      title: 'Missing CSRF Token',
      severity: 'low',
      cvss: 3.5,
      asset: 'portal.example.com',
      category: 'Web Application',
      discovered: '2026-05-02',
      status: 'not_analyzed',
    },
  ],

  resolvedFindings: [
    {
      id: 'VULN-101',
      title: 'Outdated OpenSSL Library',
      resolved: '2026-05-10',
      daysOpen: 14,
    },
    {
      id: 'VULN-102',
      title: 'Exposed Prometheus Metrics',
      resolved: '2026-05-09',
      daysOpen: 7,
    },
    {
      id: 'VULN-103',
      title: 'Insecure Cookie Settings',
      resolved: '2026-05-08',
      daysOpen: 21,
    },
    {
      id: 'VULN-104',
      title: 'Missing Rate Limiting',
      resolved: '2026-05-07',
      daysOpen: 10,
    },
    {
      id: 'VULN-105',
      title: 'Debug Mode Enabled',
      resolved: '2026-05-06',
      daysOpen: 5,
    },
  ],

  newDiscoveries: {
    domains: [
      {
        identifier: 'api.example.com',
        discovered: '2026-05-08',
        provider: 'AWS CloudFront',
        riskLevel: 'medium',
      },
      {
        identifier: 'staging.example.com',
        discovered: '2026-05-07',
        provider: 'AWS CloudFront',
        riskLevel: 'low',
      },
      {
        identifier: 'test-portal.example.com',
        discovered: '2026-05-06',
        provider: 'Azure CDN',
        riskLevel: 'low',
      },
    ],
    ipAddresses: [
      {
        identifier: '10.0.1.50',
        discovered: '2026-05-09',
        provider: 'AWS EC2',
        riskLevel: 'low',
      },
      {
        identifier: '10.0.1.51',
        discovered: '2026-05-08',
        provider: 'AWS EC2',
        riskLevel: 'medium',
      },
      {
        identifier: '172.16.0.25',
        discovered: '2026-05-07',
        provider: 'On-Premise',
        riskLevel: 'critical',
      },
    ],
    ports: [
      {
        port: 3306,
        service: 'MySQL',
        discovered: '2026-05-09',
        target: '10.0.1.50',
        riskLevel: 'high',
      },
      {
        port: 6379,
        service: 'Redis',
        discovered: '2026-05-08',
        target: '10.0.1.51',
        riskLevel: 'high',
      },
      {
        port: 5432,
        service: 'PostgreSQL',
        discovered: '2026-05-07',
        target: '10.0.1.52',
        riskLevel: 'medium',
      },
      {
        port: 27017,
        service: 'MongoDB',
        discovered: '2026-05-06',
        target: '10.0.1.53',
        riskLevel: 'critical',
      },
    ],
    technologies: [
      {
        name: 'Nginx 1.18',
        discovered: '2026-05-07',
        target: 'api.example.com',
        category: 'Web Server',
      },
      {
        name: 'Node.js 18.0',
        discovered: '2026-05-06',
        target: 'api.example.com',
        category: 'Runtime',
      },
      {
        name: 'React 18.2',
        discovered: '2026-05-06',
        target: 'portal.example.com',
        category: 'JavaScript Framework',
      },
      {
        name: 'Spring Boot 3.1',
        discovered: '2026-05-05',
        target: 'admin.example.com',
        category: 'Application Server',
      },
      {
        name: 'Docker 24.0',
        discovered: '2026-05-04',
        target: '10.50.12.44',
        category: 'Container',
      },
    ],
  },

  targets: [
    {
      id: 'TARGET-001',
      identifier: 'example.com',
      type: 'DOMAIN',
      status: 'completed',
      riskLevel: 'low',
      provider: 'Cloudflare',
      lastScan: '1h ago',
    },
    {
      id: 'TARGET-002',
      identifier: 'auth.example.com',
      type: 'DOMAIN',
      status: 'completed',
      riskLevel: 'medium',
      provider: 'AWS CloudFront',
      lastScan: '45m ago',
    },
    {
      id: 'TARGET-003',
      identifier: '34.211.90.12',
      type: 'IP',
      status: 'completed',
      riskLevel: 'low',
      provider: 'AWS EC2',
      lastScan: '3h ago',
    },
    {
      id: 'TARGET-004',
      identifier: '192.168.1.0/24',
      type: 'CIDR',
      status: 'in_progress',
      riskLevel: 'medium',
      provider: 'Internal Network',
      lastScan: '12h ago',
    },
    {
      id: 'TARGET-005',
      identifier: 'api.example.com',
      type: 'DOMAIN',
      status: 'completed',
      riskLevel: 'high',
      provider: 'AWS Lambda',
      lastScan: '30m ago',
    },
    {
      id: 'TARGET-006',
      identifier: '10.50.12.44',
      type: 'IP',
      status: 'failed',
      riskLevel: 'critical',
      provider: 'On-Premise',
      lastScan: '15m ago',
    },
    {
      id: 'TARGET-007',
      identifier: 'dev-srv-01',
      type: 'IP',
      status: 'completed',
      riskLevel: 'medium',
      provider: 'On-Premise',
      lastScan: '6h ago',
    },
    {
      id: 'TARGET-008',
      identifier: 'blog.example.com',
      type: 'DOMAIN',
      status: 'completed',
      riskLevel: 'low',
      provider: 'WP Engine',
      lastScan: '1 day ago',
    },
    {
      id: 'TARGET-009',
      identifier: 'staging.example.com',
      type: 'DOMAIN',
      status: 'pending',
      riskLevel: 'low',
      provider: 'AWS CloudFront',
      lastScan: '2 days ago',
    },
    {
      id: 'TARGET-010',
      identifier: 'admin.example.com',
      type: 'DOMAIN',
      status: 'completed',
      riskLevel: 'high',
      provider: 'AWS CloudFront',
      lastScan: '2h ago',
    },
  ],

  vulnerabilityByTarget: [
    {
      target: 'api.example.com',
      type: 'DOMAIN',
      critical: 3,
      high: 5,
      medium: 8,
      low: 4,
      total: 20,
    },
    {
      target: 'auth.example.com',
      type: 'DOMAIN',
      critical: 2,
      high: 4,
      medium: 6,
      low: 3,
      total: 15,
    },
    {
      target: '10.50.12.44',
      type: 'IP',
      critical: 2,
      high: 3,
      medium: 4,
      low: 2,
      total: 11,
    },
    {
      target: 'admin.example.com',
      type: 'DOMAIN',
      critical: 1,
      high: 3,
      medium: 5,
      low: 2,
      total: 11,
    },
    {
      target: 'dev-srv-01',
      type: 'IP',
      critical: 1,
      high: 2,
      medium: 6,
      low: 4,
      total: 13,
    },
  ],

  riskDistribution: [
    { level: 'critical', count: 3, percent: 2.4, color: 'bg-red-600' },
    { level: 'high', count: 12, percent: 9.8, color: 'bg-orange-500' },
    { level: 'medium', count: 45, percent: 36.6, color: 'bg-yellow-500' },
    { level: 'low', count: 63, percent: 51.2, color: 'bg-blue-500' },
  ],
};

function ReportCover({
  week,
  year,
  exportedAt,
  classification,
}: {
  week: number;
  year: number;
  exportedAt: string;
  classification: string;
}) {
  const { data: metadata } = useRootControllerGetMetadata({
    query: { queryKey: getRootControllerGetMetadataQueryKey() },
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="h-[297mm] flex flex-col border-b border-slate-300 mb-10 print:h-[297mm] print:break-after-page">
      <div className="shrink-0">
        <div className="h-2 bg-slate-800" />
        <div className="px-10 pt-8">
          <div className="flex items-center gap-3">
            <span className="text-slate-800">
              <Logo width={28} height={28} logoPath={metadata?.logoPath as string} />
            </span>
            <span className="text-sm font-semibold text-slate-700 uppercase tracking-widest">
              {metadata?.name || 'Open-ASM'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center px-10">
        <div className="space-y-12">
          <div className="space-y-2">
            <p className="text-sm text-slate-500 uppercase tracking-[0.2em] font-medium">
              Security Assessment Report
            </p>
            <div className="w-16 h-0.5 bg-slate-800" />
          </div>

          <div className="space-y-4">
            <h1 className="text-5xl font-bold tracking-tight text-slate-900 leading-tight">
              Attack Surface<br />
              Discovery Report
            </h1>
            <p className="text-lg text-slate-500 max-w-xl leading-relaxed">
              Comprehensive security analysis of your external attack surface,
              including vulnerability assessment, asset discovery, and risk evaluation.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-12 gap-y-3 max-w-lg">
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">Period</p>
              <p className="text-sm font-medium text-slate-800">Week {week}, {year}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">Classification</p>
              <p className="text-sm font-medium text-red-600">{classification}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">Date Exported</p>
              <p className="text-sm font-medium text-slate-800">{formatDate(exportedAt)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">Document Ref</p>
              <p className="text-sm font-medium text-slate-800 font-mono">OASM-RPT-{year}-{String(week).padStart(2, '0')}-001</p>
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-slate-200 px-10 py-6">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <p>© 2026 Open-ASM. All Rights Reserved.</p>
          <p className="text-red-500 font-medium">{classification}</p>
        </div>
      </div>
    </div>
  );
}

function ReportHeader({
  reportTitle,
  week,
  year,
  exportedAt,
  classification,
}: {
  reportTitle: string;
  week: number;
  year: number;
  exportedAt: string;
  classification: string;
}) {
  const { data: metadata } = useRootControllerGetMetadata({
    query: { queryKey: getRootControllerGetMetadataQueryKey() },
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="border-b-4 border-slate-800 pb-6 mb-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-slate-800 rounded flex items-center justify-center">
              <span className="text-white">
                <Logo
                  width={20}
                  height={20}
                  logoPath={metadata?.logoPath as string}
                />
              </span>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                {reportTitle}
              </h1>
            </div>
          </div>
          <p className="text-sm text-slate-500">
            Week {week}, {year} · Exported: {formatDate(exportedAt)}
          </p>
        </div>
        <div className="text-right">
          <span className="bg-red-100 text-red-700 border border-red-300 text-sm px-3 py-1 rounded font-medium">
            {classification}
          </span>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  change,
  changePercent,
  icon: Icon,
  isPositive,
}: {
  title: string;
  value: number | string;
  change?: number;
  changePercent?: number;
  icon: React.ElementType;
  isPositive?: boolean;
}) {
  return (
    <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">
          {title}
        </span>
        <Icon className="h-3.5 w-3.5 text-slate-400" />
      </div>
      <div className="flex items-end justify-between">
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        {change !== undefined && (
          <div
            className={`flex items-center gap-0.5 text-[9px] ${isPositive ? 'text-green-600' : 'text-red-600'}`}
          >
            {isPositive ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            <span>
              {change > 0 ? '+' : ''}
              {change} ({Math.abs(changePercent || 0).toFixed(1)}%)
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 border-red-300',
    high: 'bg-orange-100 text-orange-700 border-orange-300',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    low: 'bg-blue-100 text-blue-700 border-blue-300',
    info: 'bg-slate-100 text-slate-700 border-slate-300',
  };
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded border ${colors[severity] || colors.low}`}
    >
      {severity.toUpperCase()}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { className: string; label: string }> = {
    not_analyzed: {
      className: 'bg-slate-100 text-slate-700 border-slate-300',
      label: 'Not Analyzed',
    },
    running: {
      className: 'bg-yellow-100 text-yellow-700 border-yellow-300',
      label: 'Analyzing',
    },
    done: {
      className: 'bg-green-100 text-green-700 border-green-300',
      label: 'Analyzed',
    },
    failed: {
      className: 'bg-red-100 text-red-700 border-red-300',
      label: 'Failed',
    },
    pending: {
      className: 'bg-slate-100 text-slate-600 border-slate-300',
      label: 'Pending',
    },
    in_progress: {
      className: 'bg-blue-100 text-blue-700 border-blue-300',
      label: 'In Progress',
    },
    completed: {
      className: 'bg-green-100 text-green-700 border-green-300',
      label: 'Completed',
    },
  };
  const config = configs[status] || configs.pending;
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded border ${config.className}`}
    >
      {config.label}
    </span>
  );
}

function AssetTypeIcon({ type }: { type: string }) {
  const icons: Record<string, React.ReactNode> = {
    Domain: <Globe2 className="h-4 w-4 text-slate-600" />,
    Subdomain: <Globe2 className="h-4 w-4 text-slate-600" />,
    'IP Address': <Server className="h-4 w-4 text-slate-600" />,
    'S3 Bucket': <Cloud className="h-4 w-4 text-slate-600" />,
    Database: <Database className="h-4 w-4 text-slate-600" />,
    'API Endpoint': <Activity className="h-4 w-4 text-slate-600" />,
    'SSL Cert': <Lock className="h-4 w-4 text-slate-600" />,
    'GitHub Repo': <Globe2 className="h-4 w-4 text-slate-600" />,
  };
  return icons[type] || <Target className="h-4 w-4 text-slate-600" />;
}

function RiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    critical: 'text-red-600 bg-red-50',
    high: 'text-orange-600 bg-orange-50',
    medium: 'text-yellow-600 bg-yellow-50',
    low: 'text-green-600 bg-green-50',
  };
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded ${colors[level] || colors.low}`}
    >
      {level.toUpperCase()}
    </span>
  );
}

function SimpleBarChart({
  data,
  maxValue = 35,
}: {
  data: number[];
  maxValue?: number;
}) {
  return (
    <div className="flex items-end gap-0.5 h-16">
      {data.map((value, idx) => (
        <div
          key={idx}
          className="flex-1 bg-slate-700 rounded-t"
          style={{ height: `${(value / maxValue) * 100}%`, minHeight: '4px' }}
        />
      ))}
    </div>
  );
}

function ReportFooter() {
  return (
    <div className="border-t-2 border-slate-300 pt-4 mt-6">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <p>© 2026 Open Attack Surface Management. All Rights Reserved.</p>
        <p>Internal Confidential Document</p>
      </div>
    </div>
  );
}

export default function Reports() {
  const { workspaces, isLoading } = useWorkspaceSelector();
  const data = fakeReportsData;

  if (isLoading) return null;

  return (
    <Page
      title="Reports"
      action={
        <Button variant="outline" size="sm" className="bg-white">
          <Download className="h-4 w-4 mr-2" />
          Export PDF
        </Button>
      }
    >
      {workspaces.length === 0 ? (
        <CreateWorkspace />
      ) : (
        <div className="max-w-[210mm] mx-auto bg-white shadow-lg print:shadow-none print:w-full">
          <div className="p-8 print:p-0">
            <ReportCover
              week={data.week}
              year={data.year}
              exportedAt={data.exportedAt}
              classification={data.classification}
            />

            <ReportHeader
              reportTitle={data.reportTitle}
              week={data.week}
              year={data.year}
              exportedAt={data.exportedAt}
              classification={data.classification}
            />

            <section className="mb-6 break-inside-avoid">
              <h2 className="text-base font-bold mb-3 flex items-center gap-2 text-slate-900">
                <span className="text-slate-800">01</span>
                Weekly Performance Metrics
              </h2>
              <div className="grid grid-cols-4 gap-2 mb-3">
                <MetricCard
                  title="Targets"
                  value={data.weekly.totalTargets}
                  change={data.weekly.targetsChange}
                  changePercent={data.weekly.targetsChangePercent}
                  icon={Target}
                  isPositive={true}
                />
                <MetricCard
                  title="Assets"
                  value={data.weekly.totalAssets}
                  change={data.weekly.assetsChange}
                  changePercent={data.weekly.assetsChangePercent}
                  icon={Cloud}
                  isPositive={true}
                />
                <MetricCard
                  title="Services"
                  value={data.weekly.totalServices}
                  change={data.weekly.servicesChange}
                  changePercent={data.weekly.servicesChangePercent}
                  icon={Server}
                  isPositive={false}
                />
                <MetricCard
                  title="Security Score"
                  value={data.weekly.securityScore}
                  change={data.weekly.scoreChange}
                  changePercent={data.weekly.scoreChangePercent}
                  icon={Shield}
                  isPositive={true}
                />
              </div>
              <div className="grid grid-cols-6 gap-2 mb-3">
                <div className="bg-slate-50 p-2 rounded border border-slate-200 text-center">
                  <p className="text-[10px] text-slate-500">Total Vulns</p>
                  <p className="text-lg font-bold text-slate-900">
                    {data.weekly.activeVulns}
                  </p>
                </div>
                <div className="bg-red-50 p-2 rounded border border-red-200 text-center">
                  <p className="text-[10px] text-red-600">Critical</p>
                  <p className="text-lg font-bold text-red-600">
                    {data.weekly.criticalVulns}
                  </p>
                </div>
                <div className="bg-orange-50 p-2 rounded border border-orange-200 text-center">
                  <p className="text-[10px] text-orange-600">High</p>
                  <p className="text-lg font-bold text-orange-600">
                    {data.weekly.highVulns}
                  </p>
                </div>
                <div className="bg-yellow-50 p-2 rounded border border-yellow-200 text-center">
                  <p className="text-[10px] text-yellow-600">Medium</p>
                  <p className="text-lg font-bold text-yellow-600">
                    {data.weekly.mediumVulns}
                  </p>
                </div>
                <div className="bg-blue-50 p-2 rounded border border-blue-200 text-center">
                  <p className="text-[10px] text-blue-600">Low</p>
                  <p className="text-lg font-bold text-blue-600">
                    {data.weekly.lowVulns}
                  </p>
                </div>
                <div className="bg-slate-50 p-2 rounded border border-slate-200 text-center">
                  <p className="text-[10px] text-slate-500">Info</p>
                  <p className="text-lg font-bold text-slate-600">
                    {data.weekly.infoVulns}
                  </p>
                </div>
              </div>
              <div className="flex gap-4 text-xs text-slate-600 bg-slate-50 p-2 rounded">
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  <strong>{data.weekly.newVulns}</strong> new vulnerabilities
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  <strong>{data.weekly.resolvedVulns}</strong> resolved
                </span>
              </div>
            </section>

            <section className="mb-6 break-inside-avoid">
              <h2 className="text-base font-bold mb-3 flex items-center gap-2 text-slate-900">
                <span className="text-slate-800">02</span>
                Monthly Performance Summary
              </h2>
              <div className="grid grid-cols-4 gap-2 mb-3">
                <MetricCard
                  title="Targets"
                  value={data.monthly.totalTargets}
                  change={data.monthly.targetsChange}
                  changePercent={data.monthly.targetsChangePercent}
                  icon={Target}
                  isPositive={true}
                />
                <MetricCard
                  title="Assets"
                  value={data.monthly.totalAssets}
                  change={data.monthly.assetsChange}
                  changePercent={data.monthly.assetsChangePercent}
                  icon={Cloud}
                  isPositive={true}
                />
                <MetricCard
                  title="Services"
                  value={data.monthly.totalServices}
                  change={data.monthly.servicesChange}
                  changePercent={data.monthly.servicesChangePercent}
                  icon={Server}
                  isPositive={false}
                />
                <MetricCard
                  title="Security Score"
                  value={data.monthly.securityScore}
                  change={data.monthly.scoreChange}
                  changePercent={data.monthly.scoreChangePercent}
                  icon={Shield}
                  isPositive={true}
                />
              </div>
              <div className="grid grid-cols-6 gap-2 mb-3">
                <div className="bg-slate-50 p-2 rounded border border-slate-200 text-center">
                  <p className="text-[10px] text-slate-500">Total Vulns</p>
                  <p className="text-lg font-bold text-slate-900">
                    {data.monthly.activeVulns}
                  </p>
                </div>
                <div className="bg-red-50 p-2 rounded border border-red-200 text-center">
                  <p className="text-[10px] text-red-600">Critical</p>
                  <p className="text-lg font-bold text-red-600">
                    {data.monthly.criticalVulns}
                  </p>
                </div>
                <div className="bg-orange-50 p-2 rounded border border-orange-200 text-center">
                  <p className="text-[10px] text-orange-600">High</p>
                  <p className="text-lg font-bold text-orange-600">
                    {data.monthly.highVulns}
                  </p>
                </div>
                <div className="bg-yellow-50 p-2 rounded border border-yellow-200 text-center">
                  <p className="text-[10px] text-yellow-600">Medium</p>
                  <p className="text-lg font-bold text-yellow-600">
                    {data.monthly.mediumVulns}
                  </p>
                </div>
                <div className="bg-blue-50 p-2 rounded border border-blue-200 text-center">
                  <p className="text-[10px] text-blue-600">Low</p>
                  <p className="text-lg font-bold text-blue-600">
                    {data.monthly.lowVulns}
                  </p>
                </div>
                <div className="bg-slate-50 p-2 rounded border border-slate-200 text-center">
                  <p className="text-[10px] text-slate-500">Info</p>
                  <p className="text-lg font-bold text-slate-600">
                    {data.monthly.infoVulns}
                  </p>
                </div>
              </div>
              <div className="flex gap-4 text-xs text-slate-600 bg-slate-50 p-2 rounded">
                <span className="flex items-center gap-1">
                  <Bug className="h-3 w-3" />
                  <strong>{data.monthly.newVulns}</strong> new this month
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  <strong>{data.monthly.resolvedVulns}</strong> resolved this
                  month
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <strong>{data.monthly.scansCompleted}</strong> scans completed
                </span>
              </div>
            </section>

            <section className="mb-6 break-inside-avoid">
              <h2 className="text-base font-bold mb-3 flex items-center gap-2 text-slate-900">
                <span className="text-slate-800">03</span>
                Vulnerability Trend (Last 30 Days)
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded border border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-600">
                      Daily Vulnerabilities
                    </span>
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <TrendingDown className="h-3 w-3" />
                      Decreasing trend
                    </span>
                  </div>
                  <SimpleBarChart
                    data={data.vulnerabilityTrends.last30Days}
                    maxValue={55}
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                    <span>30 days ago</span>
                    <span>Today</span>
                  </div>
                </div>
                <div className="bg-slate-50 p-3 rounded border border-slate-200">
                  <div className="text-xs font-medium text-slate-600 mb-2">
                    Risk Distribution
                  </div>
                  <div className="space-y-1">
                    {data.riskDistribution.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-[10px] w-16 text-slate-600">
                          {item.level}
                        </span>
                        <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${item.color} rounded-full`}
                            style={{ width: `${item.percent}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-medium text-slate-700 w-8">
                          {item.count}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-2">
                    Avg: {data.vulnerabilityTrends.avgPerWeek} vulns/week
                  </div>
                </div>
              </div>
            </section>

            <section className="mb-6 break-inside-avoid">
              <h2 className="text-base font-bold mb-3 flex items-center gap-2 text-slate-900">
                <span className="text-slate-800">04</span>
                Newly Discovered Assets
              </h2>
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] font-semibold text-slate-600 mb-1">
                    New Domains
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[10px] border-collapse">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-300">
                          <th className="text-left py-1 px-2 font-semibold text-slate-700">
                            Domain
                          </th>
                          <th className="text-center py-1 px-1 font-semibold text-slate-700">
                            Discovered
                          </th>
                          <th className="text-center py-1 px-1 font-semibold text-slate-700">
                            Provider
                          </th>
                          <th className="text-center py-1 px-1 font-semibold text-slate-700">
                            Risk
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.newDiscoveries.domains.map((item, idx) => (
                          <tr
                            key={idx}
                            className="border-b border-slate-200 hover:bg-slate-50"
                          >
                            <td className="py-1 px-2 font-mono text-slate-900">
                              {item.identifier}
                            </td>
                            <td className="py-1 px-1 text-center text-slate-600">
                              {item.discovered}
                            </td>
                            <td className="py-1 px-1 text-center text-slate-600">
                              {item.provider}
                            </td>
                            <td className="py-1 px-1 text-center">
                              <RiskBadge level={item.riskLevel} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-semibold text-slate-600 mb-1">
                    New IP Addresses
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[10px] border-collapse">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-300">
                          <th className="text-left py-1 px-2 font-semibold text-slate-700">
                            IP Address
                          </th>
                          <th className="text-center py-1 px-1 font-semibold text-slate-700">
                            Discovered
                          </th>
                          <th className="text-center py-1 px-1 font-semibold text-slate-700">
                            Provider
                          </th>
                          <th className="text-center py-1 px-1 font-semibold text-slate-700">
                            Risk
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.newDiscoveries.ipAddresses.map((item, idx) => (
                          <tr
                            key={idx}
                            className="border-b border-slate-200 hover:bg-slate-50"
                          >
                            <td className="py-1 px-2 font-mono text-slate-900">
                              {item.identifier}
                            </td>
                            <td className="py-1 px-1 text-center text-slate-600">
                              {item.discovered}
                            </td>
                            <td className="py-1 px-1 text-center text-slate-600">
                              {item.provider}
                            </td>
                            <td className="py-1 px-1 text-center">
                              <RiskBadge level={item.riskLevel} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-semibold text-slate-600 mb-1">
                    New Open Ports
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[10px] border-collapse">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-300">
                          <th className="text-left py-1 px-2 font-semibold text-slate-700">
                            Port
                          </th>
                          <th className="text-left py-1 px-2 font-semibold text-slate-700">
                            Service
                          </th>
                          <th className="text-center py-1 px-1 font-semibold text-slate-700">
                            Discovered
                          </th>
                          <th className="text-left py-1 px-2 font-semibold text-slate-700">
                            Target
                          </th>
                          <th className="text-center py-1 px-1 font-semibold text-slate-700">
                            Risk
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.newDiscoveries.ports.map((item, idx) => (
                          <tr
                            key={idx}
                            className="border-b border-slate-200 hover:bg-slate-50"
                          >
                            <td className="py-1 px-2 font-mono text-slate-900">
                              {item.port}
                            </td>
                            <td className="py-1 px-2 text-slate-700">
                              {item.service}
                            </td>
                            <td className="py-1 px-1 text-center text-slate-600">
                              {item.discovered}
                            </td>
                            <td className="py-1 px-2 font-mono text-slate-600">
                              {item.target}
                            </td>
                            <td className="py-1 px-1 text-center">
                              <RiskBadge level={item.riskLevel} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-semibold text-slate-600 mb-1">
                    New Technologies Detected
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[10px] border-collapse">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-300">
                          <th className="text-left py-1 px-2 font-semibold text-slate-700">
                            Technology
                          </th>
                          <th className="text-center py-1 px-1 font-semibold text-slate-700">
                            Category
                          </th>
                          <th className="text-center py-1 px-1 font-semibold text-slate-700">
                            Discovered
                          </th>
                          <th className="text-left py-1 px-2 font-semibold text-slate-700">
                            Target
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.newDiscoveries.technologies.map((item, idx) => (
                          <tr
                            key={idx}
                            className="border-b border-slate-200 hover:bg-slate-50"
                          >
                            <td className="py-1 px-2 font-medium text-slate-900">
                              {item.name}
                            </td>
                            <td className="py-1 px-1 text-center text-slate-600">
                              {item.category}
                            </td>
                            <td className="py-1 px-1 text-center text-slate-600">
                              {item.discovered}
                            </td>
                            <td className="py-1 px-2 font-mono text-slate-600">
                              {item.target}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>

            <section className="mb-6 break-inside-avoid">
              <h2 className="text-base font-bold mb-3 flex items-center gap-2 text-slate-900">
                <span className="text-slate-800">05</span>
                New Vulnerabilities Discovered
              </h2>
              <table className="w-full text-[10px] border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300">
                    <th className="text-left py-1.5 px-2 font-semibold text-slate-700">
                      CVE / ID
                    </th>
                    <th className="text-left py-1.5 px-2 font-semibold text-slate-700">
                      Vulnerability
                    </th>
                    <th className="text-center py-1.5 px-1 font-semibold text-slate-700">
                      Severity
                    </th>
                    <th className="text-center py-1.5 px-1 font-semibold text-slate-700">
                      CVSS
                    </th>
                    <th className="text-left py-1.5 px-2 font-semibold text-slate-700">
                      Affected Asset
                    </th>
                    <th className="text-center py-1.5 px-1 font-semibold text-slate-700">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.newFindings.map((finding, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-slate-200 hover:bg-slate-50"
                    >
                      <td className="py-1.5 px-2 font-mono text-slate-600">
                        {finding.id}
                      </td>
                      <td className="py-1.5 px-2 text-slate-900">
                        {finding.title}
                      </td>
                      <td className="py-1.5 px-1 text-center">
                        <SeverityBadge severity={finding.severity} />
                      </td>
                      <td className="py-1.5 px-1 text-center font-mono text-slate-600">
                        {finding.cvss}
                      </td>
                      <td className="py-1.5 px-2 font-mono text-slate-600">
                        {finding.asset}
                      </td>
                      <td className="py-1.5 px-1 text-center">
                        <StatusBadge status={finding.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="mb-6 break-inside-avoid">
              <h2 className="text-base font-bold mb-3 flex items-center gap-2 text-slate-900">
                <span className="text-slate-800">06</span>
                Recently Resolved
              </h2>
              <table className="w-full text-[10px] border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300">
                    <th className="text-left py-1.5 px-2 font-semibold text-slate-700">
                      CVE / ID
                    </th>
                    <th className="text-left py-1.5 px-2 font-semibold text-slate-700">
                      Vulnerability
                    </th>
                    <th className="text-center py-1.5 px-2 font-semibold text-slate-700">
                      Resolved
                    </th>
                    <th className="text-center py-1.5 px-2 font-semibold text-slate-700">
                      Days Open
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.resolvedFindings.map((finding, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-slate-200 hover:bg-slate-50"
                    >
                      <td className="py-1.5 px-2 font-mono text-slate-600">
                        {finding.id}
                      </td>
                      <td className="py-1.5 px-2 text-slate-900">
                        {finding.title}
                      </td>
                      <td className="py-1.5 px-2 text-center text-slate-600">
                        {finding.resolved}
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                          {finding.daysOpen}d
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="mb-6 break-inside-avoid">
              <h2 className="text-base font-bold mb-3 flex items-center gap-2 text-slate-900">
                <span className="text-slate-800">07</span>
                Vulnerability by Target
              </h2>
              <table className="w-full text-[10px] border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300">
                    <th className="text-left py-1.5 px-2 font-semibold text-slate-700">
                      Target
                    </th>
                    <th className="text-center py-1.5 px-1 font-semibold text-slate-700">
                      Type
                    </th>
                    <th className="text-center py-1.5 px-1 font-semibold text-red-600">
                      Critical
                    </th>
                    <th className="text-center py-1.5 px-1 font-semibold text-orange-600">
                      High
                    </th>
                    <th className="text-center py-1.5 px-1 font-semibold text-yellow-600">
                      Medium
                    </th>
                    <th className="text-center py-1.5 px-1 font-semibold text-blue-600">
                      Low
                    </th>
                    <th className="text-center py-1.5 px-1 font-semibold text-slate-700">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.vulnerabilityByTarget.map((item, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-slate-200 hover:bg-slate-50"
                    >
                      <td className="py-1.5 px-2 font-medium text-slate-900 font-mono">
                        {item.target}
                      </td>
                      <td className="py-1.5 px-1 text-center text-slate-600">
                        {item.type}
                      </td>
                      <td className="py-1.5 px-1 text-center font-mono text-red-600">
                        {item.critical}
                      </td>
                      <td className="py-1.5 px-1 text-center font-mono text-orange-600">
                        {item.high}
                      </td>
                      <td className="py-1.5 px-1 text-center font-mono text-yellow-600">
                        {item.medium}
                      </td>
                      <td className="py-1.5 px-1 text-center font-mono text-blue-600">
                        {item.low}
                      </td>
                      <td className="py-1.5 px-1 text-center font-bold text-slate-900">
                        {item.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="mb-4 break-inside-avoid">
              <h2 className="text-base font-bold mb-3 flex items-center gap-2 text-slate-900">
                <span className="text-slate-800">08</span>
                Detailed Target Inventory
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b-2 border-slate-300">
                      <th className="text-left py-1.5 px-2 font-semibold text-slate-700">
                        Target Identifier
                      </th>
                      <th className="text-center py-1.5 px-1 font-semibold text-slate-700">
                        Status
                      </th>
                      <th className="text-center py-1.5 px-1 font-semibold text-slate-700">
                        Risk
                      </th>
                      <th className="text-center py-1.5 px-1 font-semibold text-slate-700">
                        Provider
                      </th>
                      <th className="text-right py-1.5 px-1 font-semibold text-slate-700">
                        Last Scan
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.targets.map((target, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-slate-200 hover:bg-slate-50"
                      >
                        <td className="py-1.5 px-2">
                          <div className="flex items-center gap-1.5">
                            <AssetTypeIcon type={target.type} />
                            <div>
                              <p className="font-medium text-slate-900 font-mono">
                                {target.identifier}
                              </p>
                              <p className="text-slate-500">{target.type}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-1.5 px-1 text-center">
                          <span className="bg-slate-100 text-slate-600 text-[9px] px-1.5 py-0.5 rounded">
                            {target.status}
                          </span>
                        </td>
                        <td className="py-1.5 px-1 text-center">
                          <RiskBadge level={target.riskLevel} />
                        </td>
                        <td className="py-1.5 px-1 text-center text-slate-500">
                          {target.provider}
                        </td>
                        <td className="py-1.5 px-1 text-right text-slate-500">
                          {target.lastScan}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <ReportFooter />
          </div>
        </div>
      )}
    </Page>
  );
}
