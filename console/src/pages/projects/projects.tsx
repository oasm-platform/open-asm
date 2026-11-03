import Page from '@/components/common/page';
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
import {
  useAssetGroupControllerGetAll,
  type AssetGroup,
} from '@/services/apis/gen/queries';
import { useNavigate } from '@tanstack/react-router';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { FolderKanban, Plus, Search, SearchX } from 'lucide-react';
import { useEffect, useState } from 'react';

dayjs.extend(relativeTime);

// Same grid as the workers, tools and integrations pages
const GRID_CLASS =
  'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4';

// Fills three or four full rows of the grid
const PAGE_SIZE = 12;

const SORT_OPTIONS = {
  newest: { label: 'Newest', sortBy: 'createdAt', sortOrder: 'DESC' },
  name: { label: 'Name', sortBy: 'name', sortOrder: 'ASC' },
  hosts: { label: 'Most hosts', sortBy: 'totalAssets', sortOrder: 'DESC' },
} as const;

type SortKey = keyof typeof SORT_OPTIONS;

const toSortKey = (sortBy: string): SortKey =>
  (Object.keys(SORT_OPTIONS) as SortKey[]).find(
    (key) => SORT_OPTIONS[key].sortBy === sortBy,
  ) ?? 'newest';

function ProjectCard({ project }: { project: AssetGroup }) {
  const navigate = useNavigate();
  const hosts = project.totalAssets || 0;

  return (
    // Same layout as the worker and tool cards: the detail link is a
    // full-card overlay
    <div className="relative flex h-full flex-col items-start gap-2 rounded-lg border p-5 text-left transition-colors hover:bg-accent/70">
      <button
        type="button"
        aria-label={project.name}
        onClick={() =>
          navigate({ to: '/projects/$id', params: { id: project.id } })
        }
        className="absolute inset-0 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex w-full min-w-0 items-center gap-2">
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-md"
          style={{ background: project.hexColor }}
        >
          <FolderKanban className="size-3.5 text-white" />
        </span>
        <h3 className="truncate text-base font-semibold">{project.name}</h3>
      </div>
      <div className="flex w-full items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {hosts} host{hosts === 1 ? '' : 's'}
        </span>
        <span>
          {project.lastRunAt
            ? `Last run ${dayjs(project.lastRunAt).fromNow()}`
            : 'Never run'}
        </span>
      </div>
      <span className="text-xs text-muted-foreground">
        Created {dayjs(project.createdAt).format('YYYY-MM-DD')}
      </span>
    </div>
  );
}

export function Projects() {
  const navigate = useNavigate();
  const {
    tableParams: { page, sortBy, sortOrder, filter },
    tableHandlers: { setPage, setFilter, setParams },
  } = useServerDataTable({ defaultPageSize: PAGE_SIZE });

  // Typed search is debounced before it reaches the URL and the API
  const [search, setSearch] = useState(filter);
  const debouncedSearch = useDebounce(search, 500);
  useEffect(() => {
    setFilter(debouncedSearch);
  }, [debouncedSearch, setFilter]);

  const { data, isLoading } = useAssetGroupControllerGetAll(
    {
      limit: PAGE_SIZE,
      page,
      sortBy,
      sortOrder,
      search: filter,
    },
    {
      query: {
        queryKey: ['projects', PAGE_SIZE, page, sortBy, sortOrder, filter],
      },
    },
  );

  const projects = data?.data ?? [];
  const pageCount = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  const renderSkeleton = () => (
    <div className={GRID_CLASS}>
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="flex flex-col items-start gap-2 rounded-lg border p-5 animate-pulse"
        >
          <div className="flex items-center gap-2">
            <div className="size-6 rounded-md bg-muted" />
            <div className="h-4 w-28 rounded-md bg-muted" />
          </div>
          <div className="flex w-full items-center justify-between gap-2">
            <div className="h-3 w-16 rounded-md bg-muted" />
            <div className="h-3 w-24 rounded-md bg-muted" />
          </div>
          <div className="h-3 w-24 rounded-md bg-muted" />
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
        No projects yet
      </h3>
      <p className="text-sm text-muted-foreground">
        Create a project to group hosts and scan them on a schedule.
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
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    );
  };

  return (
    <Page
      title="Projects"
      description="Organize hosts into projects and scan them on a schedule"
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
