import { formatDistanceToNow } from 'date-fns';
import { FileCode, MoreVertical, PanelLeftClose } from 'lucide-react';
import { useState, type ComponentProps } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import useDebounce from '@/hooks/use-debounce';
import { cn } from '@/lib/utils';
import {
  useTemplatesControllerGetMany,
  type ArtifactDto,
} from '@/services/apis/gen/queries';
import { useTemplateTabs } from '../hooks/use-template-tabs';
import { TemplateActionsMenu } from './template-actions-menu';

type Filter = 'all' | 'mine' | 'shared';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'mine', label: 'Mine' },
  { value: 'shared', label: 'Shared' },
];

type Props = ComponentProps<typeof Sidebar> & {
  /** Hides the list on desktop; the editor shows the button to bring it back. */
  onCollapse?: () => void;
};

export function TemplatesSidebar({ onCollapse, ...props }: Props) {
  const { tabs, activeId, open } = useTemplateTabs();
  const { isMobile, setOpenMobile } = useSidebar();
  const activeArtifactId = tabs.find((t) => t.id === activeId)?.artifactId;

  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 400);
  const params = {
    search: debounced || undefined,
    limit: 100,
    sortBy: 'name',
    sortOrder: 'ASC',
  } as const;
  const mine = useTemplatesControllerGetMany({ scope: 'mine', ...params });
  const shared = useTemplatesControllerGetMany({ scope: 'shared', ...params });

  const myItems = mine.data?.data ?? [];
  const sharedItems = shared.data?.data ?? [];
  const counts: Record<Filter, number> = {
    mine: mine.data?.total ?? myItems.length,
    shared: shared.data?.total ?? sharedItems.length,
    all: (mine.data?.total ?? myItems.length) + (shared.data?.total ?? sharedItems.length),
  };
  const lists = filter === 'all' ? [mine, shared] : [filter === 'mine' ? mine : shared];
  const items =
    filter === 'mine'
      ? myItems
      : filter === 'shared'
        ? sharedItems
        : [...myItems, ...sharedItems].sort((a, b) => a.name.localeCompare(b.name));
  const shown = items.length;
  const total = counts[filter];

  const renderItem = (file: ArtifactDto) => {
    const active = file.id === activeArtifactId;
    const owner = file.isOwner
      ? file.shareType === 'private'
        ? 'Private'
        : 'Shared'
      : (file.createdBy?.name ?? 'Unknown');
    return (
      <SidebarMenuItem key={file.id}>
        <SidebarMenuButton
          onClick={() => {
            open(file, !file.isOwner);
            setOpenMobile(false);
          }}
          isActive={active}
          aria-current={active ? 'true' : undefined}
          tooltip={file.name}
          className="h-auto items-start py-1.5 pr-8"
        >
          <FileCode className="mt-0.5" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate">{file.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {owner} · {formatDistanceToNow(new Date(file.updatedAt), { addSuffix: true })}
            </span>
          </span>
        </SidebarMenuButton>
        <TemplateActionsMenu
          file={file}
          side="right"
          align="start"
          trigger={
            <SidebarMenuAction showOnHover aria-label={`Actions for ${file.name}`}>
              <MoreVertical />
            </SidebarMenuAction>
          }
        />
      </SidebarMenuItem>
    );
  };

  return (
    // In-flow beside the app nav on desktop; a sheet on mobile, where it would not fit.
    <Sidebar collapsible={isMobile ? 'offcanvas' : 'none'} className="border-r" {...props}>
      <SidebarContent>
        <SidebarGroup className="gap-2">
          <Input
            placeholder="Search templates"
            aria-label="Search templates"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div role="group" aria-label="Filter templates" className="flex gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  filter === f.value
                    ? 'bg-primary/15 text-primary'
                    : 'bg-muted text-muted-foreground hover:bg-muted/70',
                )}
              >
                {f.label} {counts[f.value]}
              </button>
            ))}
          </div>
        </SidebarGroup>

        <SidebarGroup className="pt-0">
          <SidebarGroupContent>
            {lists.some((l) => l.isLoading) ? (
              <Skeleton className="h-8 w-full" />
            ) : lists.some((l) => l.isError) ? (
              <LoadError onRetry={() => lists.forEach((l) => void l.refetch())} />
            ) : items.length > 0 ? (
              <>
                <SidebarMenu>{items.map(renderItem)}</SidebarMenu>
                {total > shown && (
                  <p className="px-2 py-1 text-xs text-muted-foreground">
                    {`Showing ${shown} of ${total} — search to narrow`}
                  </p>
                )}
              </>
            ) : (
              <p className="px-2 py-1 text-sm text-muted-foreground">
                {debounced
                  ? 'No templates match your search.'
                  : filter === 'shared'
                    ? 'Nothing shared with you yet'
                    : 'No templates yet. Start one with New, Upload or AI gen.'}
              </p>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      {!isMobile && onCollapse && (
        <SidebarFooter className="border-t p-1">
          <Button
            size="sm"
            variant="ghost"
            className="justify-start text-muted-foreground"
            onClick={onCollapse}
          >
            <PanelLeftClose /> Hide list
          </Button>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2 px-2 py-1 text-sm text-muted-foreground">
      <p>Could not load templates.</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
