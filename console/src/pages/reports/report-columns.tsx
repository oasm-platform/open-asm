import type { ColumnDef } from '@tanstack/react-table';
import { Download, Eye, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatDate, fromNow } from '@/lib/date-locale';
import type { TFunction } from '@/lib/i18n-dictionary';
import { cn } from '@/lib/utils';
import type { ReportResponseDto } from '@/services/apis/gen/queries';
import { TEMPLATE_META, templateOf } from './report-meta';

interface ReportColumnHandlers {
  onPreview: (report: ReportResponseDto) => void;
  onDownload: (report: ReportResponseDto) => void;
  onDelete: (report: ReportResponseDto) => void;
  downloadingId: string | null;
  isDeleting: boolean;
}

export function buildReportColumns(
  t: TFunction,
  { onPreview, onDownload, onDelete, downloadingId, isDeleting }: ReportColumnHandlers,
): ColumnDef<ReportResponseDto>[] {
  return [
    {
      accessorKey: 'fileName',
      header: t('reports.columns.report'),
      enableSorting: true,
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-3">
          {/* The template's colour marks the row; the type column names it. */}
          <span
            className={cn('h-8 w-1 shrink-0 rounded-full', TEMPLATE_META[templateOf(row.original.type)].dot)}
          />
          <span className="truncate font-medium">{row.original.fileName}</span>
        </div>
      ),
    },
    {
      accessorKey: 'type',
      header: t('reports.columns.type'),
      enableSorting: false,
      cell: ({ row }) => {
        const meta = TEMPLATE_META[templateOf(row.original.type)];
        return (
          <Badge variant="soft" className={cn('rounded-full', meta.tone)}>
            {t(meta.labelKey)}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'createdAt',
      header: t('reports.columns.created'),
      enableSorting: true,
      cell: ({ row }) => (
        <span
          className="whitespace-nowrap text-muted-foreground"
          title={formatDate(row.original.createdAt, 'PPpp')}
        >
          {fromNow(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        // Row clicks open the preview, so every action stops its own click.
        <div
          className="flex justify-end gap-0.5 text-muted-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={t('reports.actions.preview', { name: row.original.fileName })}
            onClick={() => onPreview(row.original)}
          >
            <Eye className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={t('reports.download', { name: row.original.fileName })}
            disabled={downloadingId === row.original.id}
            onClick={() => onDownload(row.original)}
          >
            <Download className="size-4" />
          </Button>
          <ConfirmDialog
            title={t('reports.delete.title')}
            description={t('reports.delete.description', { name: row.original.fileName })}
            confirmText={t('common.delete')}
            disabled={isDeleting}
            onConfirm={() => onDelete(row.original)}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-destructive"
                aria-label={t('reports.delete.title')}
              >
                <Trash2 className="size-4" />
              </Button>
            }
          />
        </div>
      ),
    },
  ];
}
