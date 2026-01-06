import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import Image from '@/components/ui/image';
import SeverityBadge from '@/components/ui/severity-badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Vulnerability } from '@/services/apis/gen/queries';
import type { ColumnDef } from '@tanstack/react-table';
import { BellOff, CircleCheck, ExternalLink, Info } from 'lucide-react';
import { Link } from 'react-router-dom';

export const vulnerabilityColumns: ColumnDef<Vulnerability, unknown>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    ),
    cell: ({ row }) => (
      <div
        className="flex items-center justify-center min-h-[60px]"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      </div>
    ),
    size: 50,
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: 'status',
    header: 'Status',
    size: 100,
    cell: ({ row }) => {
      const dismissal = row.original.vulnerabilityDismissal;
      const isDismissed = !!dismissal;

      return (
        <div className="min-h-[60px] flex items-center">
          {isDismissed ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="secondary"
                    className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1"
                  >
                    <BellOff size={12} />
                    Dismissed
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <div className="text-xs">
                    <span className="font-medium">Reason:</span>{' '}
                    {dismissal.reason === 'false_positive'
                      ? 'False positive'
                      : dismissal.reason === 'used_in_test'
                        ? 'Used in tests'
                        : "Won't fix"}
                    {dismissal.comment && (
                      <>
                        <br />
                        <span className="font-medium">Comment:</span>{' '}
                        {dismissal.comment}
                      </>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Badge
              variant="secondary"
              className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1"
            >
              <CircleCheck size={12} />
              Open
            </Badge>
          )}
        </div>
      );
    },
    enableSorting: false,
  },
  {
    accessorKey: 'severity',
    header: 'Severity',
    size: 120,
    cell: ({ row }) => {
      const value = String(row.getValue('severity')).toLowerCase();
      return (
        <div className="min-h-[60px] flex items-center">
          <SeverityBadge severity={value} />
        </div>
      );
    },
  },
  {
    accessorKey: 'name',
    header: 'Details',
    size: 300,
    enableHiding: false,
    cell: ({ row }) => {
      const data = row.original;
      const value: string = row.getValue('name');
      const cveIds: string[] = row.original.cveId;
      return (
        <div className="flex flex-col gap-2 py-2 justify-center min-h-[60px]">
          <div className="flex items-center gap-2">
            <div className="font-medium">{value}</div>
            {Array.isArray(cveIds) &&
              cveIds.length > 0 &&
              cveIds.map((id, idx) => (
                <Badge key={id || idx} variant="outline" className="text-xs">
                  {id}
                </Badge>
              ))}
            {data.description && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info
                      size={14}
                      className="text-muted-foreground cursor-help"
                    />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-sm">
                    {data.description}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'affectedUrl',
    header: 'Affected URL',
    size: 200,
    cell: ({ row }) => {
      const value: string = row.getValue('affectedUrl');
      return (
        <div className="flex items-center min-h-[60px]">
          {value ? (
            <div className="flex items-center gap-1">
              <a
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 shrink-0 flex items-center gap-1"
              >
                <span className="truncate">{value}</span>
                <ExternalLink size={14} />
              </a>
            </div>
          ) : (
            <div className="text-muted-foreground">Not matched</div>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'cvssScore',
    header: 'CVSS Score',
    size: 120,
    cell: ({ row }) => {
      const value: string = row.getValue('cvssScore');
      return (
        <div className="min-h-[60px] flex items-center">
          {value ? (
            <Badge variant="outline" className="font-medium">
              {value}
            </Badge>
          ) : (
            <div className="text-muted-foreground">Not matched</div>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'tags',
    header: 'Tags',
    size: 150,
    cell: ({ row }) => {
      const tags = row.getValue('tags');
      if (!tags || !Array.isArray(tags)) {
        return (
          <div className="min-h-[60px] flex items-center">
            <div className="text-muted-foreground">Not matched</div>
          </div>
        );
      }

      const maxTagsDisplay = 3;
      const displayedTags = tags.slice(0, maxTagsDisplay);
      const remainingCount = tags.length - maxTagsDisplay;

      return (
        <div className="flex flex-wrap gap-1 max-w-[150px] min-h-[60px] items-center">
          {displayedTags.map((tag: string, index: number) => (
            <Badge variant="outline" key={index} className="text-xs">
              {tag}
            </Badge>
          ))}
          {remainingCount > 0 && (
            <Badge variant="outline" className="text-xs">
              +{remainingCount}
            </Badge>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'createdAt',
    header: 'Created At',
    size: 120,
    cell: ({ row }) => {
      const value: string = row.getValue('createdAt');
      return (
        <div className="min-h-[60px] flex items-center">
          {value ? (
            <div>{new Date(value).toLocaleDateString()}</div>
          ) : (
            <div className="text-muted-foreground">Not matched</div>
          )}
        </div>
      );
    },
  },
  {
    header: 'Scanned by',
    size: 200,
    cell: ({ row }) => {
      const { tool } = row.original;
      if (!tool)
        return (
          <div className="min-h-[60px] flex items-center justify-center">-</div>
        );
      return (
        <div className="min-h-[60px] flex items-center">
          <Link to={`/tools/${tool.id}`} className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 cursor-pointer">
                    <Image
                      url={tool?.logoUrl}
                      width={24}
                      height={24}
                      className="rounded"
                    />
                    <span className="text-sm font-medium">{tool.name}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="w-full max-w-[300px] p-2"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Image
                      url={tool?.logoUrl}
                      width={40}
                      height={40}
                      className="rounded"
                    />
                    <h4 className="font-bold">{tool.name}</h4>
                  </div>
                  {tool.description && (
                    <p className="text-sm">{tool.description}</p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Link>
        </div>
      );
    },
  },
];
