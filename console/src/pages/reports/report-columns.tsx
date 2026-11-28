import type { ColumnDef } from '@tanstack/react-table';
import { Eye, MoreHorizontal } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDate, fromNow } from '@/lib/date-locale';
import type { TFunction } from '@/lib/i18n-dictionary';
import { cn } from '@/lib/utils';
import type { ReportResponseDto } from '@/services/apis/gen/queries';
import { TEMPLATE_META, templateOf } from './report-meta';

interface ReportColumnOptions {
  onPreview: (report: ReportResponseDto) => void;
  onDownload: (report: ReportResponseDto) => void;
  onRerun: (report: ReportResponseDto) => void;
  onDelete: (report: ReportResponseDto) => void;
  /** Member names by user id; the column is left out when the caller cannot list members. */
  creators?: Map<string, string>;
}

export function buildReportColumns(
  t: TFunction,
  { onPreview, onDownload, onRerun, onDelete, creators }: ReportColumnOptions,
): ColumnDef<ReportResponseDto>[] {
  const columns: ColumnDef<ReportResponseDto>[] = [
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
  ];

  if (creators) {
    columns.push({
      accessorKey: 'userId',
      header: t('reports.columns.createdBy'),
      enableSorting: false,
      cell: ({ row }) => (
        <span className="truncate text-muted-foreground">
          {creators.get(row.original.userId) ?? '—'}
        </span>
      ),
    });
  }

  columns.push(
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={t('reports.actions.more', { name: row.original.fileName })}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={() => onDownload(row.original)}>
                {t('reports.actions.download')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onRerun(row.original)}>
                {t('reports.actions.rerun')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => onDelete(row.original)}>
                {t('common.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  );

  return columns;
}
