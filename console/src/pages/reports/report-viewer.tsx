import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  useSecurityReportControllerFindOne,
  downloadPdf,
} from '@/services/apis/gen/queries';
import { type SecurityReport } from './types';
import { Printer, Loader2, Edit, FileText } from 'lucide-react';
import Page from '@/components/common/page';
import { HandlebarsRenderer } from './components/handlebars-renderer';
import { ReportRole } from './types';

// Templates
import executiveTemplate from './templates/report-executive.hbs?raw';
import technicalTemplate from './templates/report-technical.hbs?raw';
import developerTemplate from './templates/report-developer.hbs?raw';
import infrastructureTemplate from './templates/report-infrastructure.hbs?raw';

const ReportViewer = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: reportData, isLoading: loading } =
    useSecurityReportControllerFindOne(id!, {
      query: {
        enabled: !!id,
      },
    });

  const report = reportData as SecurityReport;

  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (!id || isDownloading) return;
    setIsDownloading(true);
    try {
      const response = await downloadPdf(id, {
        responseType: 'blob',
      });

      const blob = new Blob([response as BlobPart], {
        type: 'application/pdf',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `security_report_${report?.name?.replace(/\s+/g, '_').toLowerCase()}.pdf`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download PDF:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary mr-2" />
        <span className="text-muted-foreground">Loading report...</span>
      </div>
    );
  if (!report)
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <FileText className="w-12 h-12 text-muted-foreground" />
        <div className="text-center">
          <h3 className="text-lg font-medium">Report not found</h3>
          <p className="text-muted-foreground">
            The report you're looking for doesn't exist.
          </p>
        </div>
        <Button onClick={() => navigate('/reports')}>Back to Reports</Button>
      </div>
    );

  const getTemplate = () => {
    const role = report.targetRole || ReportRole.DEVELOPER;
    if (role === ReportRole.EXECUTIVE) return executiveTemplate;
    if (role === ReportRole.TECHNICAL) return technicalTemplate;
    if (role === ReportRole.INFRASTRUCTURE) return infrastructureTemplate;
    return developerTemplate;
  };

  return (
    <Page
      title={`View Report - ${report.name}`}
      action={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => navigate(`/reports/${report.id}/edit`)}
          >
            <Edit className="w-4 h-4 mr-2" />
            Edit Report
          </Button>
          <Button
            variant="outline"
            onClick={handleDownload}
            disabled={isDownloading}
          >
            {isDownloading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Printer className="w-4 h-4 mr-2" />
            )}
            {isDownloading ? 'Generating...' : 'Download PDF'}
          </Button>
        </div>
      }
    >
      <div className="w-full max-w-5xl mx-auto mb-10 sm:mb-20 mt-2 relative z-0">
        <HandlebarsRenderer
          template={getTemplate()}
          data={{ report }}
          isEditing={false}
        />
      </div>
    </Page>
  );
};

export default ReportViewer;
