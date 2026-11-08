import Page from '@/components/common/page';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import useDebounce from '@/hooks/use-debounce';
import {
  getIssuesControllerGetManyQueryOptions,
  useIssuesControllerGetMany,
  type IssueListItemDto,
  type IssuesControllerGetManyParams,
} from '@/services/apis/gen/queries';
import { useQueries } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Search, Workflow } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CreateIssueDialog } from './components/create-issue-dialog';
import {
  AssigneeCell,
  DueLabel,
  IssueStatusBadge,
  IssueTypeChip,
  PriorityBadge,
  ProgressCell,
} from './components/issue-chips';
import { IssueRulesSection } from './components/issue-rules-section';
import { MemberSelect } from './components/member-select';
import {
  formatIssueNo,
  ISSUE_PRIORITY_HINT,
  ISSUE_STATUS_LABELS,
  ISSUE_TYPE_LABELS,
  type IssuePriority,
  type IssueStatus,
  type IssueType,
} from './issue-utils';

export const ISSUE_TABS = ['mine', 'open', 'overdue', 'resolved', 'all'] as const;
export type IssueTab = (typeof ISSUE_TABS)[number];

const TAB_LABELS: Record<IssueTab, string> = {
  mine: 'Mine',
  open: 'Open',
  overdue: 'Overdue',
  resolved: 'Resolved',
  all: 'All',
};

/** Base filter of each tab; the toolbar filters narrow it further. */
export function tabParams(tab: IssueTab): IssuesControllerGetManyParams {
  switch (tab) {
    case 'mine':
      return { mine: true, status: ['open', 'in_progress'] };
    case 'open':
      return { status: ['open', 'in_progress'] };
    case 'overdue':
      return { overdue: true };
    case 'resolved':
      return { status: ['resolved', 'closed'] };
    default:
      return {};
  }
}

export interface IssuesSearch {
  tab?: IssueTab;
  type?: IssueType;
  status?: IssueStatus;
  priority?: IssuePriority;
  assigneeId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

const ALL = '__all__';

function linkSummary(issue: IssueListItemDto) {
  if (issue.type === 'vulnerability_remediation' && issue.progress) {
    const n = issue.progress.total;
    return `${n} ${n === 1 ? 'vulnerability' : 'vulnerabilities'}`;
  }
  if (!issue.linkCount) return 'No links';
  return `${issue.linkCount} linked ${issue.linkCount === 1 ? 'resource' : 'resources'}`;
}

const columns: ColumnDef<IssueListItemDto>[] = [
  {
    id: 'no',
    accessorKey: 'no',
    header: 'No',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {formatIssueNo(row.original.no)}
      </span>
    ),
  },
  {
    id: 'title',
    header: 'Title',
    enableSorting: false,
    cell: ({ row }) => (
      <div className="flex min-w-48 max-w-md flex-col">
        <span className="truncate font-medium">{row.original.title}</span>
        <span className="truncate text-xs text-muted-foreground">
          {linkSummary(row.original)}
        </span>
      </div>
    ),
  },
  {
    id: 'type',
    header: 'Type',
    enableSorting: false,
    cell: ({ row }) => <IssueTypeChip type={row.original.type} />,
  },
  {
    id: 'status',
    header: 'Status',
    enableSorting: false,
    cell: ({ row }) => <IssueStatusBadge status={row.original.status} />,
  },
  {
    id: 'priority',
    accessorKey: 'priority',
    header: 'P',
    cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
  },
  {
    id: 'assignee',
    header: 'Assignee',
    enableSorting: false,
    cell: ({ row }) => <AssigneeCell user={row.original.assignee} />,
  },
  {
    id: 'dueAt',
    accessorKey: 'dueAt',
    header: 'Due',
    cell: ({ row }) => (
      <DueLabel dueAt={row.original.dueAt} status={row.original.status} />
    ),
  },
  {
    id: 'progress',
    header: 'Progress',
    enableSorting: false,
    cell: ({ row }) => <ProgressCell progress={row.original.progress} />,
  },
  {
    id: 'source',
    header: 'Source',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.ruleId ? 'Rule' : 'Manual'}
      </span>
    ),
  },
];

function useTabCounts(): Partial<Record<IssueTab, number>> {
  const results = useQueries({
    queries: ISSUE_TABS.map((tab) =>
      getIssuesControllerGetManyQueryOptions({ ...tabParams(tab), limit: 1 }),
    ),
  });
  const counts: Partial<Record<IssueTab, number>> = {};
  ISSUE_TABS.forEach((tab, i) => {
    const total = results[i]?.data?.total;
    if (total !== undefined) counts[tab] = total;
  });
  return counts;
}

export default function Issues() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as IssuesSearch;
  const tab: IssueTab = ISSUE_TABS.includes(search.tab as IssueTab)
    ? (search.tab as IssueTab)
    : 'open';
  const page = search.page ?? 1;
  const pageSize = search.pageSize ?? 20;
  const sortBy = search.sortBy ?? 'updatedAt';
  const sortOrder = search.sortOrder ?? 'DESC';

  const counts = useTabCounts();
  const [createOpen, setCreateOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const update = (next: Partial<IssuesSearch>, resetPage = true) =>
    void navigate({
      to: '.',
      search: ((prev: IssuesSearch) => {
        const merged: Record<string, unknown> = {
          ...prev,
          ...next,
          ...(resetPage ? { page: undefined } : {}),
        };
        for (const key of Object.keys(merged)) {
          if (merged[key] === undefined || merged[key] === '') delete merged[key];
        }
        return merged;
      }) as never,
      replace: true,
    });

  const [searchText, setSearchText] = useState(search.search ?? '');
  const debounced = useDebounce(searchText, 400);
  const updateRef = useRef(update);
  updateRef.current = update;
  useEffect(() => {
    if ((search.search ?? '') !== debounced) {
      updateRef.current({ search: debounced || undefined });
    }
    // Only the debounced text drives the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const params = useMemo<IssuesControllerGetManyParams>(() => {
    const base = tabParams(tab);
    return {
      ...base,
      ...(search.status ? { status: [search.status] } : {}),
      ...(search.type ? { type: [search.type] } : {}),
      ...(search.priority ? { priority: [search.priority] } : {}),
      ...(search.assigneeId ? { assigneeId: search.assigneeId } : {}),
      ...(search.search ? { search: search.search } : {}),
      page,
      limit: pageSize,
      sortBy: sortBy as IssuesControllerGetManyParams['sortBy'],
      sortOrder,
    };
  }, [tab, search.status, search.type, search.priority, search.assigneeId, search.search, page, pageSize, sortBy, sortOrder]);

  const { data, isLoading, isError } = useIssuesControllerGetMany(params);

  const filters = [
    <Select
      key="type"
      value={search.type ?? ALL}
      onValueChange={(v) =>
        update({ type: v === ALL ? undefined : (v as IssueType) })
      }
    >
      <SelectTrigger aria-label="Type filter" className="h-9 w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All types</SelectItem>
        {Object.entries(ISSUE_TYPE_LABELS).map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>,
    <Select
      key="status"
      value={search.status ?? ALL}
      onValueChange={(v) =>
        update({ status: v === ALL ? undefined : (v as IssueStatus) })
      }
    >
      <SelectTrigger aria-label="Status filter" className="h-9 w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Any status</SelectItem>
        {Object.entries(ISSUE_STATUS_LABELS).map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>,
    <Select
      key="priority"
      value={search.priority ?? ALL}
      onValueChange={(v) =>
        update({ priority: v === ALL ? undefined : (v as IssuePriority) })
      }
    >
      <SelectTrigger aria-label="Priority filter" className="h-9 w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Any priority</SelectItem>
        {Object.entries(ISSUE_PRIORITY_HINT).map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>,
    <MemberSelect
      key="assignee"
      ariaLabel="Assignee filter"
      className="h-9 w-44"
      value={search.assigneeId ?? null}
      noneLabel="Any assignee"
      placeholder="Any assignee"
      onChange={(v) => update({ assigneeId: v ?? undefined })}
    />,
  ];

  return (
    <Page
      title="Issues"
      description="Remediation work and follow-ups across the workspace"
      action={
        <>
          <Button variant="outline" onClick={() => setRulesOpen(true)}>
            <Workflow className="size-4" />
            Rules
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            New issue
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Tabs
          value={tab}
          onValueChange={(v) => update({ tab: v as IssueTab, status: undefined })}
        >
          <TabsList>
            {ISSUE_TABS.map((t) => (
              <TabsTrigger key={t} value={t} badge={counts[t]}>
                {TAB_LABELS[t]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <DataTable<IssueListItemDto, unknown>
          // In the table's own toolbar, so the gap to the table is the 16px every list uses.
          filterComponents={[
            <div key="filters" className="flex w-full flex-wrap items-center gap-2">
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  aria-label="Search issues"
                  placeholder="Search title or #number…"
                  className="h-9 pl-8"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
              </div>
              {filters}
            </div>,
          ]}
          data={data?.data ?? []}
          columns={columns}
          isLoading={isLoading}
          page={page}
          pageSize={pageSize}
          totalItems={data?.total ?? 0}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onPageChange={(p) => update({ page: p }, false)}
          onPageSizeChange={(size) => update({ pageSize: size })}
          onSortChange={(col, order) =>
            update({ sortBy: col, sortOrder: order }, false)
          }
          emptyMessage={
            tab === 'mine' ? 'Nothing assigned to you' : 'No issues found'
          }
          error={isError ? 'Failed to load issues' : undefined}
          rowClassName="cursor-pointer hover:bg-muted/50"
          onRowClick={(row) =>
            void navigate({ to: '/issues/$id', params: { id: row.id } })
          }
        />
      </div>

      <CreateIssueDialog open={createOpen} onOpenChange={setCreateOpen} />

      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Issue rules</DialogTitle>
            <DialogDescription>
              Also available under Settings → Vulnerability management.
            </DialogDescription>
          </DialogHeader>
          <IssueRulesSection />
        </DialogContent>
      </Dialog>
    </Page>
  );
}
