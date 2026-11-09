import { ChevronRight, FileCode, MoreVertical, Plus, Upload } from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import useDebounce from '@/hooks/use-debounce';
import { usePermission } from '@/hooks/usePermission';
import {
  useTemplatesControllerGetMany,
  type ArtifactDto,
} from '@/services/apis/gen/queries';
import { useTemplateTabs } from '../hooks/use-template-tabs';
import { useTemplateUpload } from '../hooks/use-template-upload';
import { TemplateActionsMenu } from './template-actions-menu';

const NEW_SHORTCUT = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘I' : 'Ctrl+I';

export function TemplatesSidebar(props: ComponentProps<typeof Sidebar>) {
  const { hasPermission } = usePermission();
  const canWrite = hasPermission('artifact.write');
  const { tabs, activeId, open, openNew } = useTemplateTabs();
  const { isMobile, setOpenMobile } = useSidebar();
  const activeArtifactId = tabs.find((t) => t.id === activeId)?.artifactId;
  const startNew = () => {
    openNew();
    setOpenMobile(false);
  };
  const { pick, input } = useTemplateUpload();

  useHotkeys(
    'mod+i',
    (e) => {
      e.preventDefault();
      startNew();
    },
    { enabled: canWrite, enableOnContentEditable: true, enableOnFormTags: true },
  );

  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 400);
  const mine = useTemplatesControllerGetMany({
    scope: 'mine',
    search: debounced || undefined,
    limit: 100,
    sortBy: 'name',
    sortOrder: 'ASC',
  });
  const shared = useTemplatesControllerGetMany({
    scope: 'shared',
    search: debounced || undefined,
    limit: 100,
    sortBy: 'name',
    sortOrder: 'ASC',
  });

  const myItems = mine.data?.data ?? [];
  const sharedItems = shared.data?.data ?? [];

  const hint = (shown: number, total?: number) =>
    total !== undefined && total > shown ? (
      <p className="px-2 py-1 text-xs text-muted-foreground">
        {`Showing ${shown} of ${total} — search to narrow`}
      </p>
    ) : null;

  const renderItem = (file: ArtifactDto, manage: boolean) => (
    <SidebarMenuItem key={file.id}>
      <SidebarMenuButton
        onClick={() => {
          open(file, !file.isOwner);
          setOpenMobile(false);
        }}
        isActive={file.id === activeArtifactId}
        aria-current={file.id === activeArtifactId ? 'true' : undefined}
        tooltip={file.name}
        className="pr-8"
      >
        <FileCode />
        <span className="truncate">{file.name}</span>
        <Badge variant="outline" className="ml-auto shrink-0 font-normal">
          {manage
            ? file.shareType === 'private'
              ? 'Private'
              : 'Shared'
            : (file.createdBy?.name ?? 'Unknown')}
        </Badge>
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

  return (
    // In-flow beside the app nav on desktop; a sheet on mobile, where it would not fit.
    <Sidebar collapsible={isMobile ? 'offcanvas' : 'none'} className="border-r" {...props}>
      <SidebarContent>
        <SidebarGroup className="gap-2">
          {canWrite && (
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={startNew}>
                <Plus /> New
                <kbd className="ml-1 rounded bg-primary-foreground/20 px-1 text-xs">
                  {NEW_SHORTCUT}
                </kbd>
              </Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={pick}>
                <Upload /> Upload
              </Button>
            </div>
          )}
          {input}
          <Input
            placeholder="Search templates"
            aria-label="Search templates"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </SidebarGroup>

        <Collapsible defaultOpen asChild>
        <SidebarGroup>
          <SidebarGroupLabel asChild>
            <CollapsibleTrigger className="group/trigger">
              My templates
              <ChevronRight className="ml-auto transition-transform group-data-[state=open]/trigger:rotate-90" />
            </CollapsibleTrigger>
          </SidebarGroupLabel>
          <CollapsibleContent>
          <SidebarGroupContent>
            {mine.isLoading ? (
              <Skeleton className="h-8 w-full" />
            ) : mine.isError ? (
              <LoadError onRetry={() => void mine.refetch()} />
            ) : myItems.length > 0 ? (
              <>
                <SidebarMenu>{myItems.map((f) => renderItem(f, true))}</SidebarMenu>
                {hint(myItems.length, mine.data?.total)}
              </>
            ) : (
              <div className="flex flex-col items-start gap-2 px-2 py-1 text-sm text-muted-foreground">
                <p>
                  {debounced
                    ? 'No templates match your search.'
                    : 'No templates yet. Write one or upload existing YAML files.'}
                </p>
                {canWrite && !debounced && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={startNew}>
                      New template
                    </Button>
                    <Button size="sm" variant="outline" onClick={pick}>
                      Upload files
                    </Button>
                  </div>
                )}
              </div>
            )}
          </SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
        </Collapsible>

        <Collapsible defaultOpen asChild>
          <SidebarGroup>
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="group/trigger">
                Shared with me
                <ChevronRight className="ml-auto transition-transform group-data-[state=open]/trigger:rotate-90" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                {shared.isLoading ? (
                  <Skeleton className="h-8 w-full" />
                ) : shared.isError ? (
                  <LoadError onRetry={() => void shared.refetch()} />
                ) : sharedItems.length > 0 ? (
                  <>
                    <SidebarMenu>
                      {sharedItems.map((f) => renderItem(f, false))}
                    </SidebarMenu>
                    {hint(sharedItems.length, shared.data?.total)}
                  </>
                ) : (
                  <p className="px-2 py-1 text-sm text-muted-foreground">
                    {debounced
                      ? 'No templates match your search.'
                      : 'Nothing shared with you yet'}
                  </p>
                )}
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
      </SidebarContent>
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
