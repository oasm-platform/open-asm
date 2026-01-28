import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Save, Eye, Loader2 } from 'lucide-react';
import {
  useSecurityReportControllerFindOne,
  useSecurityReportControllerCreate,
  useSecurityReportControllerUpdate,
  useSecurityReportControllerPreview,
  type UpdateReportDtoTargetRole,
  type CreateReportDtoTargetRole,
} from '@/services/apis/gen/queries';
import {
  type ReportContent,
  ReportStatus,
  ReportRole,
  type SecurityReport,
} from './types';
import { toast } from 'sonner';
import Page from '@/components/common/page';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { HandlebarsRenderer } from './components/handlebars-renderer';
import lodashSet from 'lodash/set';

// Templates
import executiveTemplate from './templates/report-executive.hbs?raw';
import technicalTemplate from './templates/report-technical.hbs?raw';
import developerTemplate from './templates/report-developer.hbs?raw';
import infrastructureTemplate from './templates/report-infrastructure.hbs?raw';

const defaultContent: ReportContent = {
  executive: {
    summary: '',
    riskRating: '',
    top3Risks: [],
    businessImpact: '',
    actionPlan: '',
  },
  technical: {
    scope: '',
    architecture: '',
    vulnerabilitySummary: '',
    owaspCwe: '',
    components: '',
    roadmap: '',
  },
  developer: { vulnerabilities: [] },
  infrastructure: {
    assets: '',
    networkExposure: '',
    misconfig: '',
    tls: '',
    secrets: '',
    hardening: '',
  },
};

const ReportEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { selectedWorkspace } = useWorkspaceSelector();
  const [report, setReport] = useState<Partial<SecurityReport>>({
    name: '',
    description: '',
    status: ReportStatus.DRAFT,
    targetRole: ReportRole.DEVELOPER,
    content: defaultContent,
    workspaceId: selectedWorkspace,
  });

  const { data: reportData, isLoading: isFetching } =
    useSecurityReportControllerFindOne(id!, {
      query: { enabled: !!id && id !== 'new' },
    });

  const previewMutation = useSecurityReportControllerPreview();
  const initializedRef = useRef<{ workspaceId?: string; role?: string }>({});

  useEffect(() => {
    if (
      id === 'new' &&
      selectedWorkspace &&
      !report.id &&
      (initializedRef.current.workspaceId !== selectedWorkspace ||
        initializedRef.current.role !== report.targetRole)
    ) {
      initializedRef.current = {
        workspaceId: selectedWorkspace,
        role: report.targetRole,
      };

      previewMutation
        .mutateAsync({
          data: {
            name: `Security Report - ${new Date().toLocaleDateString()}`,
            workspaceId: selectedWorkspace,
            targetRole: report.targetRole as CreateReportDtoTargetRole,
            status: ReportStatus.DRAFT,
          },
        })
        .then((data) => {
          setReport(data as Partial<SecurityReport>);
        })
        .catch(() => {
          toast.error('Failed to generate report preview');
          // Reset ref on error to allow retry
          initializedRef.current = {};
        });
    }
  }, [id, selectedWorkspace, report.targetRole, report.id, previewMutation]);

  useEffect(() => {
    if (reportData) {
      const loadedReport = reportData as SecurityReport;
      if (loadedReport.content?.developer?.vulnerabilities) {
        loadedReport.content.developer.vulnerabilities =
          loadedReport.content.developer.vulnerabilities.map((v) => ({
            ...v,
            severity: (v.severity?.toUpperCase() || 'LOW') as
              | 'CRITICAL'
              | 'HIGH'
              | 'MEDIUM'
              | 'LOW'
              | 'INFO',
          }));
      }
      setReport(loadedReport);
    }
  }, [reportData]);

  const createMutation = useSecurityReportControllerCreate();
  const updateMutation = useSecurityReportControllerUpdate();

  const handleSave = async () => {
    if (!report.name) {
      toast.error('Please enter report name');
      return;
    }
    try {
      if (id && id !== 'new') {
        await updateMutation.mutateAsync({
          id,
          data: {
            name: report.name!,
            description: report.description,
            status: report.status!,
            targetRole: report.targetRole as UpdateReportDtoTargetRole,
            content: report.content,
          },
        });
        toast.success('Report updated');
      } else {
        const response = await createMutation.mutateAsync({
          data: {
            name: report.name!,
            description: report.description || '',
            workspaceId: selectedWorkspace!,
            status: report.status!,
            targetRole: report.targetRole as CreateReportDtoTargetRole,
            content: report.content,
          },
        });
        toast.success('Report created');
        navigate(`/reports/${response.id}/edit`);
      }
    } catch {
      toast.error('Failed to save report');
    }
  };

  const onUpdate = (path: string, value: string) => {
    setReport((prev) => {
      const next = { ...prev };
      lodashSet(next, path, value);
      return next;
    });
  };

  interface ActionData {
    index?: number;
  }

  const handleAction = (action: string, data?: ActionData) => {
    setReport((prev) => {
      const next = { ...prev };
      if (action === 'add-risk') {
        const risks = [...(prev.content?.executive?.top3Risks || [])];
        risks.push({ name: 'New Risk', description: '', impact: 'High' });
        lodashSet(next, 'content.executive.top3Risks', risks);
      } else if (action === 'remove-risk') {
        const risks = (prev.content?.executive?.top3Risks || []).filter(
          (_, i) => i !== data?.index,
        );
        lodashSet(next, 'content.executive.top3Risks', risks);
      } else if (action === 'add-finding') {
        const vulns = [...(prev.content?.developer?.vulnerabilities || [])];
        vulns.push({
          name: 'New Vulnerability',
          description: '',
          severity: 'LOW',
          endpoint: '',
          reproduce: '',
          fix: '',
          category: 'Web Application',
          rootCause: 'Logic Error',
          evidence: '',
        });
        lodashSet(next, 'content.developer.vulnerabilities', vulns);
      } else if (action === 'remove-finding') {
        const vulns = (prev.content?.developer?.vulnerabilities || []).filter(
          (_, i) => i !== data?.index,
        );
        lodashSet(next, 'content.developer.vulnerabilities', vulns);
      }
      return { ...next };
    });
  };

  const loading =
    isFetching || createMutation.isPending || updateMutation.isPending;

  if (loading && !report.id) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading report...</p>
      </div>
    );
  }

  const getTemplate = () => {
    const role = report.targetRole || ReportRole.DEVELOPER;
    if (role === ReportRole.EXECUTIVE) return executiveTemplate;
    if (role === ReportRole.TECHNICAL) return technicalTemplate;
    if (role === ReportRole.INFRASTRUCTURE) return infrastructureTemplate;
    return developerTemplate;
  };

  return (
    <Page
      title={id === 'new' ? 'New Report' : 'Edit Report'}
      action={
        <div className="flex items-center gap-2">
          {report.id && (
            <Button
              variant="outline"
              onClick={() => navigate(`/reports/${report.id}/view`)}
            >
              <Eye className="w-4 h-4 mr-2" />
              Preview Report
            </Button>
          )}

          <Select
            value={report.targetRole}
            onValueChange={(value) =>
              setReport((prev) => ({
                ...prev,
                targetRole: value as ReportRole,
              }))
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Target Audience" />
            </SelectTrigger>
            <SelectContent>
              {Object.values(ReportRole).map((role) => (
                <SelectItem key={role} value={role}>
                  {role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={handleSave} disabled={loading}>
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      }
    >
      <div className="w-full max-w-5xl mx-auto mb-10 sm:mb-20 mt-2 relative z-0">
        <HandlebarsRenderer
          template={getTemplate()}
          data={{ report: report as SecurityReport }}
          isEditing={true}
          onUpdate={onUpdate}
          onAction={handleAction}
        />
      </div>
    </Page>
  );
};

export default ReportEditor;
