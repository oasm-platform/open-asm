import { fromNow } from '@/lib/date-locale';
import { useT } from '@/lib/i18n-dictionary';
import Page from '@/components/common/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { OpenLink } from '@/components/ui/open-link';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import useDebounce from '@/hooks/use-debounce';
import {
  JobStatus,
  useTargetsControllerGetTargetRepositoriesInfinite,
  useTargetsControllerReScanTarget,
  type Target,
} from '@/services/apis/gen/queries';
import { useNavigate } from '@tanstack/react-router';
import type { AxiosError } from 'axios';
import {
  ExternalLink,
  GitBranch,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { FastScanDialog } from '../vulnerabilities/components/fast-scan-dialog';
import { VulnerabilitiesView } from '../vulnerabilities/vulnerabilities-view';
import { TargetSwitcher } from './components/target-switcher';
import SettingTarget from './setting-target';

const TABS = [
  { value: 'repositories', labelKey: 'targets.tabs.repositories' },
  { value: 'vulnerabilities', labelKey: 'targets.tabs.vulnerabilities' },
];

const PAGE_SIZE = 50;

/**
 * Detail view of a GIT_ORG target: its synced repositories instead of the
 * host inventory, plus the shared vulnerabilities tab.
 */
export function GitOrgDetail({
  target,
  tab,
  refetch,
}: {
  target: Target;
  tab: string | undefined;
  refetch: () => void;
}) {
  const t = useT();
  const navigate = useNavigate({ from: '/targets/$id/$tab' });
  const activeTab = TABS.some((item) => item.value === tab) ? tab! : 'repositories';

  const { mutate: syncNow, isPending: isSyncing } =
    useTargetsControllerReScanTarget({
      mutation: {
        onSuccess: () => {
          toast.success(t('targets.gitOrg.syncStarted'));
          refetch();
        },
        onError: (error) => {
          const err = error as AxiosError<{ message?: string }>;
          toast.error(err.response?.data?.message ?? t('targets.gitOrg.syncFailed'));
        },
      },
    });

  return (
    <Page
      permission="target.read"
      documentTitle={target.value}
      title={
        <TargetSwitcher
          currentTargetId={target.id}
          currentTargetValue={target.value}
          currentTargetLogo={target.logo}
        />
      }
     
      header={
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {t('targets.gitOrg.repositoryCount', { count: target.totalAssets ?? 0 })}
            </Badge>
            {!target.integrationId && (
              <Badge variant="destructive">{t('targets.gitOrg.disconnected')}</Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            <p className="hidden text-muted-foreground md:block">
              {t('targets.gitOrg.synced', { time: fromNow(target.lastDiscoveredAt) })}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={isSyncing || !target.integrationId}
              onClick={() => syncNow({ id: target.id })}
            >
              <RefreshCw className={`size-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {t('targets.gitOrg.syncNow')}
            </Button>
            <SettingTarget target={target} refetch={refetch} />
          </div>
        </div>
      }
    >
      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          navigate({ to: '/targets/$id/$tab', params: { id: target.id, tab: value } })
        }
        className="w-full gap-4"
      >
        <TabsList>
          {TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value} className="hover:cursor-pointer">
              {t(item.labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="repositories">
          <RepositoriesTable targetId={target.id} />
        </TabsContent>
        <TabsContent value="vulnerabilities">
          <VulnerabilitiesView
            targetId={target.id}
            actions={
              <FastScanDialog
                target={{ id: target.id, value: target.value }}
                disabled={target.status !== JobStatus.completed}
              />
            }
          />
        </TabsContent>
      </Tabs>
    </Page>
  );
}

function RepositoriesTable({ targetId }: { targetId: string }) {
  const t = useT();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim(), 300);

  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useTargetsControllerGetTargetRepositoriesInfinite(
      targetId,
      { limit: PAGE_SIZE, ...(debouncedSearch ? { search: debouncedSearch } : {}) },
      {
        query: {
          getNextPageParam: (last) =>
            last.hasNextPage ? last.page + 1 : undefined,
          initialPageParam: 1,
          refetchInterval: 30_000,
        },
      },
    );
  const repositories = data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <div className="space-y-3">
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label={t('targets.gitOrg.search')}
          placeholder={t('targets.gitOrg.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 pl-8 text-xs"
        />
      </div>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {!isLoading && repositories.length === 0 && (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          {debouncedSearch
            ? t('targets.gitOrg.noMatch')
            : t('targets.gitOrg.empty')}
        </div>
      )}

      {repositories.length > 0 && (
        <ul className="divide-y rounded-md border">
          {repositories.map((repo) => (
            <li
              key={repo.id}
              className={`flex items-center justify-between gap-3 px-3 py-2 ${repo.isEnabled ? '' : 'opacity-60'}`}
            >
              <div className="min-w-0 space-y-0.5">
                <p className="truncate font-medium">{repo.fullName}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {repo.defaultBranch && (
                    <span className="flex items-center gap-1">
                      <GitBranch className="size-3" />
                      {repo.defaultBranch}
                    </span>
                  )}
                  {repo.pushedAt && (
                    <span>{t('targets.gitOrg.updated', { time: fromNow(repo.pushedAt) })}</span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {!repo.isEnabled && (
                  <Badge variant="outline" title={t('targets.gitOrg.notScanned')}>
                    {t('targets.gitOrg.skipped')}
                  </Badge>
                )}
                {repo.archived && <Badge variant="outline">{t('targets.gitOrg.archived')}</Badge>}
                {repo.fork && <Badge variant="outline">{t('targets.gitOrg.fork')}</Badge>}
                <Badge variant="secondary">
                  {repo.private ? t('targets.gitOrg.private') : t('targets.gitOrg.public')}
                </Badge>
                <OpenLink
                  href={repo.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={t('targets.gitOrg.open', { name: repo.fullName })}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="size-4" />
                </OpenLink>
              </div>
            </li>
          ))}
        </ul>
      )}

      {hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage && <Loader2 className="mr-2 size-4 animate-spin" />}
          {t('targets.gitOrg.loadMore')}
        </Button>
      )}
    </div>
  );
}
