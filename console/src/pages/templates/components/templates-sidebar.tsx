import { FileCode, MoreVertical, Plus, Upload } from 'lucide-react';
import { useRef, useState, type ComponentProps } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useHotkeys } from 'react-hotkeys-hook';
import { AxiosError } from 'axios';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  SidebarRail,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import useDebounce from '@/hooks/use-debounce';
import { usePermission } from '@/hooks/usePermission';
import { handleServerError } from '@/lib/handle-server-error';
import { ShareFileDialog } from '@/pages/files/components/share-file-dialog';
import {
  artifactsControllerDownload,
  useArtifactsControllerRemove,
  useTemplatesControllerCreate,
  useTemplatesControllerGetMany,
  useTemplatesControllerRename,
  type ArtifactDto,
} from '@/services/apis/gen/queries';
import { useTemplateTabs } from '../hooks/use-template-tabs';

const NAME_PATTERN = /\.ya?ml$/i;

export function TemplatesSidebar(props: ComponentProps<typeof Sidebar>) {
  const { hasPermission } = usePermission();
  const canWrite = hasPermission('artifact.write');
  const { tabs, open, openNew, rename: renameTab, close } = useTemplateTabs();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);

  useHotkeys(
    'mod+i',
    (e) => {
      e.preventDefault();
      openNew();
    },
    { enabled: canWrite },
  );

  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 400);
  const mine = useTemplatesControllerGetMany({
    scope: 'mine',
    search: debounced || undefined,
    limit: 100,
  });
  const shared = useTemplatesControllerGetMany({
    scope: 'shared',
    search: debounced || undefined,
    limit: 100,
  });
  const refresh = () => {
    void mine.refetch();
    void shared.refetch();
  };

  const create = useTemplatesControllerCreate();
  const remove = useArtifactsControllerRemove();
  const rename = useTemplatesControllerRename();

  const [renaming, setRenaming] = useState<ArtifactDto | null>(null);
  const [deleting, setDeleting] = useState<ArtifactDto | null>(null);
  const [sharing, setSharing] = useState<ArtifactDto | null>(null);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    let done = 0;
    // Sequential: concurrent creates would race for the workspace quota.
    for (const file of Array.from(files)) {
      try {
        await create.mutateAsync({
          data: { name: file.name, content: await file.text() },
        });
        done++;
      } catch (error) {
        if (error instanceof AxiosError && error.response?.status === 409) {
          toast.error(
            error.response.data?.message ?? 'Workspace storage is full',
            {
              action: {
                label: 'Manage files',
                onClick: () => void navigate({ to: '/settings/$tab', params: { tab: 'files' } }),
              },
            },
          );
          // Quota errors repeat for every remaining file; stop after the first.
          break;
        } else {
          handleServerError(error);
        }
      }
    }
    if (done) toast.success(`Uploaded ${done} template${done > 1 ? 's' : ''}`);
    refresh();
  };

  const download = async (file: ArtifactDto) => {
    try {
      const { url } = await artifactsControllerDownload(file.id);
      window.location.assign(url);
    } catch (error) {
      handleServerError(error);
    }
  };

  const myItems = mine.data?.data ?? [];
  const sharedItems = shared.data?.data ?? [];

  const renderItem = (file: ArtifactDto, manage: boolean) => (
    <SidebarMenuItem key={file.id}>
      <SidebarMenuButton
        onClick={() => open(file, !file.isOwner)}
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
      <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuAction
              showOnHover
              aria-label={`Actions for ${file.name}`}
            >
              <MoreVertical />
            </SidebarMenuAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start">
            {manage && canWrite && (
              <>
                <DropdownMenuItem onSelect={() => setRenaming(file)}>
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setSharing(file)}>
                  Share
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem onSelect={() => void download(file)}>
              Download
            </DropdownMenuItem>
            {manage && canWrite && (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setDeleting(file)}
              >
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
    </SidebarMenuItem>
  );

  return (
    <Sidebar
      className="top-(--header-height) h-[calc(100svh-var(--header-height))]!"
      {...props}
    >
      <SidebarContent>
        <SidebarGroup className="gap-2">
          {canWrite && (
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={openNew}>
                <Plus /> New
                <kbd className="ml-1 rounded bg-primary-foreground/20 px-1 text-xs">
                  Ctrl+I
                </kbd>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => fileInput.current?.click()}
              >
                <Upload /> Upload
              </Button>
            </div>
          )}
          <input
            ref={fileInput}
            type="file"
            accept=".yaml,.yml"
            multiple
            hidden
            aria-label="Upload templates"
            onChange={(e) => {
              void upload(e.target.files);
              e.target.value = '';
            }}
          />
          <Input
            placeholder="Search templates"
            aria-label="Search templates"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>My templates</SidebarGroupLabel>
          <SidebarGroupContent>
            {mine.isLoading ? (
              <Skeleton className="h-8 w-full" />
            ) : mine.isError ? (
              <LoadError onRetry={() => void mine.refetch()} />
            ) : myItems.length > 0 ? (
              <SidebarMenu>{myItems.map((f) => renderItem(f, true))}</SidebarMenu>
            ) : (
              <div className="flex flex-col items-start gap-2 px-2 py-1 text-sm text-muted-foreground">
                <p>
                  {debounced
                    ? 'No templates match your search.'
                    : 'No templates yet. Write one or upload existing YAML files.'}
                </p>
                {canWrite && !debounced && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={openNew}>
                      New template
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fileInput.current?.click()}
                    >
                      Upload files
                    </Button>
                  </div>
                )}
              </div>
            )}
          </SidebarGroupContent>
        </SidebarGroup>

        {(shared.isLoading || shared.isError || sharedItems.length > 0) && (
          <SidebarGroup>
            <SidebarGroupLabel>Shared with me</SidebarGroupLabel>
            <SidebarGroupContent>
              {shared.isLoading ? (
                <Skeleton className="h-8 w-full" />
              ) : shared.isError ? (
                <LoadError onRetry={() => void shared.refetch()} />
              ) : (
                <SidebarMenu>
                  {sharedItems.map((f) => renderItem(f, false))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarRail />

      {renaming && (
        <RenameDialog
          file={renaming}
          pending={rename.isPending}
          onClose={() => setRenaming(null)}
          onSubmit={(name) =>
            rename.mutate(
              { id: renaming.id, data: { name } },
              {
                onSuccess: () => {
                  toast.success('Template renamed');
                  renameTab(renaming.id, name);
                  setRenaming(null);
                  refresh();
                },
                onError: handleServerError,
              },
            )
          }
        />
      )}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title="Delete template"
          description={`Delete "${deleting.name}"? This cannot be undone.`}
          confirmText="Delete"
          onConfirm={() =>
            remove.mutate(
              { id: deleting.id },
              {
                onSuccess: () => {
                  toast.success('Template deleted');
                  tabs
                    .filter((t) => t.artifactId === deleting.id)
                    .forEach((t) => close(t.id));
                  refresh();
                },
                onError: handleServerError,
              },
            )
          }
        />
      )}
      {sharing && (
        <ShareFileDialog
          file={sharing}
          onOpenChange={(o) => !o && setSharing(null)}
          onChanged={refresh}
        />
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

function RenameDialog({
  file,
  pending,
  onClose,
  onSubmit,
}: {
  file: ArtifactDto;
  pending: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(file.name);
  const [error, setError] = useState<string>();

  const submit = () => {
    const trimmed = name.trim();
    if (!NAME_PATTERN.test(trimmed)) {
      setError('Name must end in .yaml or .yml');
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename template</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="grid gap-2"
        >
          <Label htmlFor="template-name">Template name</Label>
          <Input
            id="template-name"
            value={name}
            aria-invalid={!!error}
            onChange={(e) => {
              setName(e.target.value);
              setError(undefined);
            }}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
