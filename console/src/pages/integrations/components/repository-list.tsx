import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import useDebounce from '@/hooks/use-debounce';
import { useIntegrationsControllerListRepositoriesInfinite } from '@/services/apis/gen/queries';
import { ExternalLink, Loader2, Search } from 'lucide-react';
import { useState } from 'react';

const PAGE_SIZE = 20;

interface RepositoryListProps {
  integrationId: string;
}

/**
 * Repositories visible to a SOURCE_CODE integration, fetched live from the
 * provider. Read-only for now: it proves the capability works and is the
 * picker the "link repository as target" flow will build on.
 */
export function RepositoryList({ integrationId }: RepositoryListProps) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim(), 300);

  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useIntegrationsControllerListRepositoriesInfinite(
    integrationId,
    { limit: PAGE_SIZE, ...(debouncedSearch ? { search: debouncedSearch } : {}) },
    {
      query: {
        getNextPageParam: (lastPage) =>
          lastPage.hasNextPage ? lastPage.page + 1 : undefined,
        initialPageParam: 1,
        retry: false,
      },
    },
  );

  const repositories = data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <Label className="text-sm font-medium">Repositories</Label>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search repositories"
          placeholder="Search repositories..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 pl-8 text-xs"
        />
      </div>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      )}

      {isError && (
        <p className="text-sm text-destructive">
          Could not load repositories. Check the token and its permissions with
          the Test button above.
        </p>
      )}

      {!isLoading && !isError && repositories.length === 0 && (
        <p className="text-sm text-muted-foreground">No repositories found.</p>
      )}

      {repositories.length > 0 && (
        <ul className="max-h-72 divide-y overflow-y-auto">
          {repositories.map((repo) => (
            <li
              key={repo.id}
              className="flex items-center justify-between gap-2 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm">{repo.fullName}</p>
                {repo.defaultBranch && (
                  <p className="text-xs text-muted-foreground">
                    {repo.defaultBranch}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {repo.archived && <Badge variant="outline">Archived</Badge>}
                <Badge variant="secondary">
                  {repo.private ? 'Private' : 'Public'}
                </Badge>
                <a
                  href={repo.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={`Open ${repo.fullName}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="size-4" />
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}

      {hasNextPage && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage && <Loader2 className="mr-2 size-4 animate-spin" />}
          Load more
        </Button>
      )}
    </div>
  );
}
