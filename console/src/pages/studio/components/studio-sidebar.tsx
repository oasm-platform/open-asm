import {
  ChevronRight,
  Command,
  File,
  Folder,
  MoreVertical,
  Plus,
} from 'lucide-react';
import * as React from 'react';
import { useState, type JSX } from 'react';

import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarRail,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import useDebounce from '@/hooks/use-debounce';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  getTemplatesControllerGetAllTemplatesQueryKey,
  useTemplatesControllerDeleteTemplate,
  useTemplatesControllerGetAllTemplates,
  useTemplatesControllerRenameFile,
} from '@/services/apis/gen/queries';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useSetAtom } from 'jotai';
import { useForm } from 'react-hook-form';
import { useHotkeys } from 'react-hotkeys-hook';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  addNewTemplateAtom,
  addTemplateAtom,
  removeServerTemplateAtom,
} from '../atoms';

const data = {
  changes: [
    {
      file: 'template-example.yaml',
      state: 'M',
    },
  ],
};

const renameSchema = z.object({
  fileName: z.string().min(1, 'Name is required'),
});

type RenameFormData = z.infer<typeof renameSchema>;

export function StudioSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const addTemplate = useSetAtom(addNewTemplateAtom);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);

  useHotkeys('ctrl+i', (e) => {
    e.preventDefault();
    addTemplate();
  });

  return (
    <Sidebar
      className="top-(--header-height) h-[calc(100svh-var(--header-height))]!"
      {...props}
    >
      <SidebarContent>
        <SidebarGroup>
          <div className="flex flex-col gap-2 p-2">
            <Button onClick={() => addTemplate()} size="sm">
              <Plus className="size-4" />
              Add new template
              <span className="text-xs bg-muted/40 rounded px-1.5 py-0.5 ml-2">
                <Command className="size-3 inline-block mr-1" />+ I
              </span>
            </Button>
            <Input
              placeholder="Search Template..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Changes</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {data.changes.map((item, index) => (
                <SidebarMenuItem key={index}>
                  <SidebarMenuButton>
                    <File />
                    {item.file}
                  </SidebarMenuButton>
                  <SidebarMenuBadge>{item.state}</SidebarMenuBadge>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Files</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <Tree search={debouncedSearch} />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

const RenameDialog = React.memo<{
  fileName: string;
  trigger: JSX.Element;
  templateId: string;
}>(({ fileName, trigger, templateId }) => {
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const form = useForm<RenameFormData>({
    resolver: zodResolver(renameSchema),
    defaultValues: {
      fileName,
    },
  });

  React.useEffect(() => {
    if (open) {
      form.reset({ fileName });
    }
  }, [open, fileName, form]);

  const { mutate } = useTemplatesControllerRenameFile();

  const onSubmit = (data: RenameFormData) => {
    if (data.fileName.trim() && data.fileName !== fileName) {
      mutate(
        { templateId, data },
        {
          onSuccess: () => {
            toast.success('Rename successfully!');
            queryClient.invalidateQueries({
              queryKey: getTemplatesControllerGetAllTemplatesQueryKey(),
            });
          },
        },
      );
    }
    setOpen(false);
  };

  const handleCancel = () => {
    setOpen(false);
  };

  const clonedTrigger = React.cloneElement(trigger, {
    onClick: (e: React.MouseEvent) => {
      e.preventDefault();
      setOpen(true);
    },
    onMouseDown: (e: React.MouseEvent) => {
      e.preventDefault();
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{clonedTrigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename Template</DialogTitle>
          <DialogDescription>
            Enter a new name for "{fileName}".
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="py-4">
            <FormField
              control={form.control}
              name="fileName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>File name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter new file name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            onClick={form.handleSubmit(onSubmit)}
            disabled={
              !form.formState.isValid || form.watch('fileName') === fileName
            }
          >
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

RenameDialog.displayName = 'RenameDialog';

const FileActionsMenu = React.memo<{
  fileName: string;
  templateId: string;
}>(({ fileName, templateId }) => {
  const isMobile = useIsMobile();

  const { mutate } = useTemplatesControllerDeleteTemplate();
  const removeTemplate = useSetAtom(removeServerTemplateAtom);
  const queryClient = useQueryClient();

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <div className="h-6 w-6 p-0 hover:bg-primary/50 flex items-center justify-center hover:cursor-pointer rounded-full">
          <MoreVertical className="size-3" />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={isMobile ? 'bottom' : 'right'} align="start">
        <RenameDialog
          templateId={templateId}
          fileName={fileName}
          trigger={
            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
              Rename Template
            </DropdownMenuItem>
          }
        />
        <ConfirmDialog
          title="Delete Template"
          description={`Are you sure you want to delete "${fileName}"? This action cannot be undone.`}
          onConfirm={() =>
            mutate(
              { templateId },
              {
                onSuccess: () => {
                  toast.success('Delete successfully!');
                  removeTemplate(templateId);

                  queryClient.invalidateQueries({
                    queryKey: getTemplatesControllerGetAllTemplatesQueryKey(),
                  });
                },
              },
            )
          }
          confirmText="Delete"
          trigger={
            <DropdownMenuItem
              variant="destructive"
              onSelect={(e) => {
                e.preventDefault();
              }}
            >
              Delete Template
            </DropdownMenuItem>
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

FileActionsMenu.displayName = 'FileActionsMenu';

function Tree({ search }: { search: string }) {
  const { data, isLoading } = useTemplatesControllerGetAllTemplates({
    limit: 30,
    value: search,
  });
  //TODO: replace loading with skeleton
  //
  const addTemplate = useSetAtom(addTemplateAtom);

  const [folderName, items] = [
    'Workspace templates',
    data?.data.map((e) => ({
      fileName: e.fileName,
      templateId: e.id,
    })) || [],
  ];

  const truncateName = (name: string, maxLength: number = 20) => {
    return name.length > maxLength
      ? name.substring(0, maxLength) + '...'
      : name;
  };

  return (
    <SidebarMenuItem>
      <Collapsible
        className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
        defaultOpen={folderName === 'Workspace templates'}
      >
        <CollapsibleTrigger asChild>
          <SidebarMenuButton>
            <ChevronRight className="transition-transform" />
            <Folder />
            {folderName}
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {isLoading ? (
            <SidebarMenuSub>
              <Skeleton className="h-7 w-full rounded-full" />
            </SidebarMenuSub>
          ) : (
            <SidebarMenuSub>
              {items.length > 0 ? (
                items.map((e) => (
                  <SidebarMenuButton
                    key={e.templateId}
                    className="data-[active=true]:bg-transparent flex items-center justify-between w-full p-0"
                    onClick={() => {
                      addTemplate(e.templateId);
                    }}
                  >
                    <div className="flex items-center min-w-0 flex-1 px-2 py-1.5">
                      <File className="size-4 mr-2 flex-shrink-0" />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="truncate text-sm">
                            {truncateName(e.fileName)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{e.fileName}</TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="px-2">
                      <FileActionsMenu
                        fileName={e.fileName}
                        templateId={e.templateId}
                      />
                    </div>
                  </SidebarMenuButton>
                ))
              ) : (
                <span>No template</span>
              )}
            </SidebarMenuSub>
          )}
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}
