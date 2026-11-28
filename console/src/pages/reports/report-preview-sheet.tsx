import { Download, ExternalLink, Loader2, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formatDate, fromNow } from '@/lib/date-locale';
import { useT } from '@/lib/i18n-dictionary';
import { cn } from '@/lib/utils';
import {
  useReportsControllerGetDownloadUrl,
  type ReportResponseDto,
} from '@/services/apis/gen/queries';
import { TEMPLATE_META, templateOf } from './report-meta';

interface ReportPreviewSheetProps {
  report: ReportResponseDto | null;
  onOpenChange: (open: boolean) => void;
  onDownload: (report: ReportResponseDto) => void;
  onDelete: (report: ReportResponseDto) => void;
  isDeleting: boolean;
}

export function ReportPreviewSheet({
  report,
  onOpenChange,
  onDownload,
  onDelete,
  isDeleting,
}: ReportPreviewSheetProps) {
  const t = useT();
  const { data, isLoading, isError } = useReportsControllerGetDownloadUrl(
    report?.id ?? '',
    { disposition: 'inline' },
    {
      query: {
        enabled: Boolean(report),
        // Re-sign well before the URL expires; never reuse it across reopenings.
        staleTime: 60_000,
        gcTime: 0,
      },
    },
  );

  const meta = report ? TEMPLATE_META[templateOf(report.type)] : null;

  return (
    <Sheet open={Boolean(report)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-3xl">
        {report && meta && (
          <>
            <SheetHeader className="gap-2 border-b pr-12">
              <div className="flex items-center gap-2">
                <Badge variant="soft" className={cn('gap-1', meta.tone)}>
                  <meta.icon />
                  {t(meta.labelKey)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  <span title={formatDate(report.createdAt, 'PPpp')}>{fromNow(report.createdAt)}</span>
                </span>
              </div>
              <SheetTitle className="truncate font-mono text-sm">{report.fileName}</SheetTitle>
              <SheetDescription className="sr-only">{t('reports.preview.title')}</SheetDescription>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button size="sm" onClick={() => onDownload(report)}>
                  <Download className="size-4" />
                  {t('reports.preview.download')}
                </Button>
                {data?.url && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={data.url} target="_blank" rel="noreferrer noopener">
                      <ExternalLink className="size-4" />
                      {t('reports.preview.openInNewTab')}
                    </a>
                  </Button>
                )}
                <ConfirmDialog
                  title={t('reports.delete.title')}
                  description={t('reports.delete.description', { name: report.fileName })}
                  confirmText={t('common.delete')}
                  disabled={isDeleting}
                  onConfirm={() => onDelete(report)}
                  trigger={
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto text-destructive hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                      {t('common.delete')}
                    </Button>
                  }
                />
              </div>
            </SheetHeader>
            <div className="relative flex-1 bg-muted/40">
              {isLoading ? (
                <div className="absolute inset-0 grid place-items-center text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              ) : isError || !data?.url ? (
                <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted-foreground">
                  {t('reports.preview.loadFailed')}
                </div>
              ) : (
                <iframe
                  key={data.url}
                  src={data.url}
                  title={t('reports.preview.title')}
                  className="absolute inset-0 size-full border-0"
                />
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
