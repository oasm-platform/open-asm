import type { SecurityReport } from '@/services/apis/gen/queries';
import type { ColumnDef } from '@tanstack/react-table';
import dayjs from 'dayjs';
import {
  FileText,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  BadgeCheck,
  Clock,
  FileArchive,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ReportColumnProps {
  onDelete: (id: string) => void;
  onNavigate: (path: string) => void;
  onDownload: (id: string, name: string) => void;
}

export const getReportColumns = ({
  onDelete,
  onNavigate,
  onDownload,
}: ReportColumnProps): ColumnDef<SecurityReport>[] => [
  {
    accessorKey: 'name',
    header: 'Name',
    size: 350,
    cell: ({ row }) => {
      const report = row.original;
      return (
        <div className="flex items-center gap-3 h-10">
          <FileText className="w-5 h-5 text-indigo-500 shrink-0" />
          <div className="flex flex-col overflow-hidden leading-tight">
            <span
              className="text-slate-900 dark:text-slate-100 font-semibold truncate max-w-[250px]"
              title={report.name}
            >
              {report.name}
            </span>
            <span className="text-[11px] text-slate-500 truncate max-w-[300px]">
              {report.description || 'No description provided'}
            </span>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    size: 140,
    cell: ({ row }) => {
      const status = row.original.status;
      const config: Record<
        string,
        { icon: React.ReactNode; className: string; label: string }
      > = {
        COMPLETED: {
          icon: <BadgeCheck className="h-4 w-4" />,
          label: 'Completed',
          className: 'text-green-500',
        },
        DRAFT: {
          icon: <Clock className="h-4 w-4" />,
          label: 'Draft',
          className: 'text-yellow-500',
        },
        ARCHIVED: {
          icon: <FileArchive className="h-4 w-4" />,
          label: 'Archived',
          className: 'text-slate-500',
        },
      };

      const { icon, className, label } = config[status] || config.DRAFT;

      return (
        <div className="flex items-center h-10">
          <Badge
            variant="outline"
            className={cn(
              'flex items-center gap-1.5 px-3 h-8 text-xs font-bold rounded-md border shadow-none transition-all',
              className,
            )}
          >
            {icon}
            {label}
          </Badge>
        </div>
      );
    },
  },
  {
    accessorKey: 'creator',
    header: 'Owner',
    size: 180,
    cell: ({ row }) => {
      const ownerName = row.original.creator?.name || 'Unknown';

      return (
        <div className="flex items-center h-10">
          <span
            className="text-sm text-slate-600 dark:text-slate-400 truncate max-w-[150px]"
            title={ownerName}
          >
            {ownerName}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: 'updatedAt',
    header: 'Date Modified',
    size: 200,
    cell: ({ row }) => {
      return (
        <div className="flex items-center h-10">
          <span className="text-sm text-slate-600 dark:text-slate-400">
            {dayjs(row.original.updatedAt).fromNow()}
          </span>
        </div>
      );
    },
  },
  {
    id: 'actions',
    size: 50,
    cell: ({ row }) => {
      const report = row.original;
      return (
        <div
          className="flex items-center justify-end h-10 pr-8"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400 hover:text-slate-600"
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => onNavigate(`/reports/${report.id}/view`)}
              >
                <Eye className="w-4 h-4 text-slate-500" />
                <span>Preview</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => onDownload(report.id, report.name)}
              >
                <Download className="w-4 h-4 text-slate-500" />
                <span>Download</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => onNavigate(`/reports/${report.id}/edit`)}
              >
                <Edit className="w-4 h-4 text-slate-500" />
                <span>Edit</span>
              </DropdownMenuItem>
              <ConfirmDialog
                title="Delete Report"
                description="Are you sure? This action cannot be undone."
                onConfirm={() => onDelete(report.id)}
                confirmText="Delete"
                trigger={
                  <div className="flex items-center gap-2 w-full px-2 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30 rounded-sm cursor-pointer transition-colors">
                    <Trash2 className="w-4 h-4" />
                    <span>Delete</span>
                  </div>
                }
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    },
  },
];
