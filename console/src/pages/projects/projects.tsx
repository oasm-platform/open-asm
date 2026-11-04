import Page from '@/components/common/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import useDebounce from '@/hooks/use-debounce';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import { getLocalTimezone } from '@/lib/cron-schedule';
import { cn } from '@/lib/utils';
import {
  ProjectStatusFilter,
  ProjectTriggerType,
  type ProjectTriggerEvent,
  useProjectsControllerGetMany,
  type ProjectListItemDto,
} from '@/services/apis/gen/queries';
import { useNavigate } from '@tanstack/react-router';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  CalendarClock,
  FolderKanban,
  Play,
  Plus,
  Search,
  SearchX,
  Zap,
} from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { SeverityBar, SeverityCounts } from './components/severity-bar';
import { nextCronRun, TRIGGER_EVENT_LABELS } from './project-utils';

dayjs.extend(relativeTime);

// Same grid as the workers, tools and integrations pages
const GRID_CLASS =
  'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4';

// Fills three or four full rows of the grid
const PAGE_SIZE = 12;

const SORT_OPTIONS = {
  risk: { label: 'Highest risk', sortBy: 'risk', sortOrder: 'DESC' },
  newest: { label: 'Newest', sortBy: 'createdAt', sortOrder: 'DESC' },
  lastRun: { label: 'Last run', sortBy: 'lastRunAt', sortOrder: 'DESC' },
  name: { label: 'Name', sortBy: 'name', sortOrder: 'ASC' },
  assets: { label: 'Most assets', sortBy: 'totalAssets', sortOrder: 'DESC' },
} as const;

type SortKey = keyof typeof SORT_OPTIONS;

const toSortKey = (sortBy: string): SortKey =>
  (Object.keys(SORT_OPTIONS) as SortKey[]).find(
    (key) => SORT_OPTIONS[key].sortBy === sortBy,
  ) ?? 'risk';

const STATUS_OPTIONS = [
  { value: ProjectStatusFilter.active, label: 'Active' },
  { value: ProjectStatusFilter.archived, label: 'Archived' },
  { value: ProjectStatusFilter.all, label: 'All' },
];

function Meta({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">
        {label}
      </dt>
      <dd className="truncate text-sm font-medium tabular-nums" title={title}>
        {value}
      </dd>
    </div>
  );
}

/** How the project runs on its own, at a glance. */
function TriggerChips({ project }: { project: ProjectListItemDto }) {
  const enabled = project.triggers.filter((t) => t.enabled);
  const hasCron = enabled.some((t) => t.type === ProjectTriggerType.cron);
  const events = [
    ...new Set(
      enabled
        .filter((t) => t.type === ProjectTriggerType.event && t.event)
        .map((t) => t.event as ProjectTriggerEvent),
    ),
  ];
  const chip = 'gap-1 font-normal';
  if (project.archivedAt) {
    return <Badge variant="outline" className={chip}>Triggers off</Badge>;
  }
  if (!hasCron && events.length === 0) {
    return (
      <Badge variant="outline" className={chip}>
        <Play className="size-3" />
        Manual only
      </Badge>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {hasCron && (
        <Badge variant="outline" className={chip}>
          <CalendarClock className="size-3" />
          Schedule
        </Badge>
      )}
      {events.map((event) => (
        <Badge key={event} variant="outline" className={chip}>
          <Zap className="size-3" />
          {TRIGGER_EVENT_LABELS[event]}
        </Badge>
      ))}
    </div>
  );
}

const ProjectCard = memo(function ProjectCard({
  project,
  timezone,
}: {
  project: ProjectListItemDto;
  timezone: string;
}) {
  const navigate = useNavigate();
  const next = project.archivedAt ? null : nextCronRun(project.triggers, timezone);

  return (
    // Same layout as the worker and tool cards: the detail link is a
    // full-card overlay
    <div
      className={cn(
        'relative flex h-full flex-col gap-3 rounded-lg border p-5 text-left transition-colors hover:bg-accent/70',
        project.archivedAt && 'opacity-70',
      )}
    >
      <button
        type="button"
        aria-label={project.name}
        onClick={() =>
          navigate({
            to: '/projects/$id/$tab',
            params: { id: project.id, tab: 'overview' },
          })
        }
        className="absolute inset-0 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex w-full min-w-0 items-center gap-2">
        <FolderKanban className="size-5 shrink-0 text-primary" />
        <h3 className="min-w-0 flex-1 truncate text-base font-semibold">
          {project.name}
        </h3>
        {project.archivedAt ? (
          <Badge variant="secondary">Archived</Badge>
        ) : project.newVulnerabilities > 0 ? (
          <Badge variant="soft">+{project.newVulnerabilities} new</Badge>
        ) : null}
      </div>
      {project.description && (
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {project.description}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <SeverityBar counts={project.openVulnerabilities} />
        <SeverityCounts counts={project.openVulnerabilities} />
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        <Meta label="Assets" value={String(project.totalAssets)} />
        <Meta label="Workflows" value={String(project.workflowCount)} />
        <Meta
          label="Last run"
          value={project.lastRunAt ? dayjs(project.lastRunAt).fromNow() : 'Never'}
          title={
            project.lastRunAt
              ? dayjs(project.lastRunAt).format('DD MMM YYYY, HH:mm')
              : undefined
          }
        />
        <Meta
          label="Next run"
          value={next ? dayjs(next).fromNow() : '—'}
          title={next ? dayjs(next).format('DD MMM YYYY, HH:mm') : undefined}
        />
      </dl>
      <TriggerChips project={project} />
    </div>
  );
});

export function Projects() {
  const navigate = useNavigate();
  const timezone = getLocalTimezone();
  const {
    tableParams: { page, sortBy, sortOrder, filter },
    tableHandlers: { setPage, setFilter, setParams },
  } = useServerDataTable({
    defaultPageSize: PAGE_SIZE,
    defaultSortBy: 'risk',
    defaultSortOrder: 'DESC',
  });
  const [status, setStatus] = useState<ProjectStatusFilter>(
    ProjectStatusFilter.active,
  );

  // Typed search is debounced before it reaches the URL and the API
  const [search, setSearch] = useState(filter);
  const debouncedSearch = useDebounce(search, 500);
  useEffect(() => {
    setFilter(debouncedSearch);
  }, [debouncedSearch, setFilter]);

  const { data, isLoading } = useProjectsControllerGetMany({
    limit: PAGE_SIZE,
    page,
    sortBy,
    sortOrder,
    search: filter,
    status,
  });

  const projects = data?.data ?? [];
  const pageCount = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  const renderSkeleton = () => (
    <div className={GRID_CLASS}>
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-lg border p-5 animate-pulse"
        >
          <div className="flex items-center gap-2">
            <div className="size-6 rounded-md bg-muted" />
            <div className="h-4 w-28 rounded-md bg-muted" />
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted" />
          <div className="grid grid-cols-2 gap-2">
            <div className="h-8 rounded-md bg-muted" />
            <div className="h-8 rounded-md bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );

  const renderEmpty = () => (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <FolderKanban className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium text-muted-foreground">
        {status === ProjectStatusFilter.archived
          ? 'No archived projects'
          : 'No projects yet'}
      </h3>
      <p className="text-sm text-muted-foreground">
        Create a project to keep a set of assets scanned: pick them by hand or
        by rules, choose the pipeline, and when it runs.
      </p>
    </div>
  );

  const renderNoMatch = () => (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <SearchX className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium text-muted-foreground">
        No matching projects
      </h3>
      <p className="text-sm text-muted-foreground">Try a different search.</p>
    </div>
  );

  const renderContent = () => {
    if (isLoading) return renderSkeleton();
    if (!projects.length) return filter ? renderNoMatch() : renderEmpty();
    return (
      <div className={GRID_CLASS}>
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} timezone={timezone} />
        ))}
      </div>
    );
  };

  return (
    <Page
      title="Projects"
      description="Keep a set of assets scanned and see what each run found"
      permission="project.read"
    >
      <div className="flex flex-col gap-4">
        {/* Same toolbar as the workers page: search and sort on the left,
            actions on the right from md up; stacked below md */}
        <div className="flex flex-col gap-2 md:flex-row-reverse md:items-center md:justify-between">
          <div className="flex items-center gap-2 md:justify-end">
            <Button
              variant="outline"
              onClick={() => navigate({ to: '/projects/create' })}
            >
              <Plus />
              Create
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:min-w-0 md:flex-1">
            <div className="relative w-full md:min-w-48 md:max-w-xs md:flex-1 xl:max-w-sm">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search projects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-8 text-xs"
              />
            </div>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value as ProjectStatusFilter);
                setPage(1);
              }}
            >
              <SelectTrigger
                aria-label="Project status"
                className="w-[120px] border-dashed py-0 text-xs focus:outline-none focus:ring-0 focus:ring-offset-0"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={toSortKey(sortBy)}
              onValueChange={(key) => {
                const option = SORT_OPTIONS[key as SortKey];
                setParams({
                  sortBy: option.sortBy,
                  sortOrder: option.sortOrder,
                  page: 1,
                });
              }}
            >
              <SelectTrigger
                aria-label="Sort projects"
                className="w-[150px] border-dashed py-0 text-xs focus:outline-none focus:ring-0 focus:ring-offset-0"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_OPTIONS) as SortKey[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {SORT_OPTIONS[key].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {renderContent()}

        {pageCount > 1 && (
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setPage(page - 1);
                  }}
                  className={page <= 1 ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>
              <PaginationItem className="px-2 text-sm text-muted-foreground">
                Page {page} of {pageCount}
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setPage(page + 1);
                  }}
                  className={
                    page >= pageCount ? 'pointer-events-none opacity-50' : ''
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>
    </Page>
  );
}
