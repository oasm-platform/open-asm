import {
  ChevronRight,
  Command,
  File,
  Folder,
  MoreVertical,
  Plus,
} from 'lucide-react';
import type { JSX } from 'react';
import * as React from 'react';

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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTemplatesControllerGetAllTemplates } from '@/services/apis/gen/queries';
import { useSetAtom } from 'jotai';
import { useHotkeys } from 'react-hotkeys-hook';
import { addTemplateAtom } from '../atoms';

const data = {
  changes: [
    {
      file: 'template-example.yaml',
      state: 'M',
    },
  ],
};

export function StudioSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const addTemplate = useSetAtom(addTemplateAtom);

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
            <Input placeholder="Search Template..." />
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
              <Tree />
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
  onConfirm: (newName: string) => void;
  trigger: JSX.Element;
}>(({ fileName, onConfirm, trigger }) => {
  const [open, setOpen] = React.useState(false);
  const [newName, setNewName] = React.useState(fileName);

  React.useEffect(() => {
    if (open) {
      setNewName(fileName);
    }
  }, [open, fileName]);

  const handleConfirm = () => {
    if (newName.trim() && newName !== fileName) {
      onConfirm(newName.trim());
      setOpen(false);
    }
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
        <div className="py-4">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New template name"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleConfirm();
              } else if (e.key === 'Escape') {
                handleCancel();
              }
            }}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!newName.trim() || newName === fileName}
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
  onRename: (fileName: string, newName: string) => void;
  onDelete: (fileName: string) => void;
}>(({ fileName, onRename, onDelete }) => {
  const isMobile = useIsMobile();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 hover:bg-muted"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={isMobile ? 'bottom' : 'right'} align="start">
        <RenameDialog
          fileName={fileName}
          onConfirm={(newName) => onRename(fileName, newName)}
          trigger={
            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
              Rename Template
            </DropdownMenuItem>
          }
        />
        <ConfirmDialog
          title="Delete Template"
          description={`Are you sure you want to delete "${fileName}"? This action cannot be undone.`}
          onConfirm={() => onDelete(fileName)}
          confirmText="Delete"
          trigger={
            <DropdownMenuItem
              variant="destructive"
              onSelect={(e) => e.preventDefault()}
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

function Tree() {
  const { data } = useTemplatesControllerGetAllTemplates({
    limit: 10,
    page: 1,
  });
  if (!data) return 'loading';
  console.log(data);

  const [folderName, items] = [
    'Workspace templates',
    data.data.map((e) => e.fileName),
  ];

  const truncateName = (name: string, maxLength: number = 20) => {
    return name.length > maxLength
      ? name.substring(0, maxLength) + '...'
      : name;
  };

  const handleRename = (fileName: string, newName: string) => {
    // Placeholder for rename functionality
    console.log('Rename', fileName, 'to', newName);
  };

  const handleDelete = (fileName: string) => {
    // Placeholder for delete functionality
    console.log('Delete', fileName);
  };

  return (
    <SidebarMenuItem>
      <Collapsible
        className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
        defaultOpen={folderName === 'components' || folderName === 'ui'}
      >
        <CollapsibleTrigger asChild>
          <SidebarMenuButton>
            <ChevronRight className="transition-transform" />
            <Folder />
            {folderName}
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {items.length > 0 ? (
              items.map((fileName) => (
                <SidebarMenuButton
                  key={fileName}
                  isActive={fileName === 'button.tsx'}
                  className="data-[active=true]:bg-transparent flex items-center justify-between w-full p-0"
                >
                  <div className="flex items-center min-w-0 flex-1 px-2 py-1.5">
                    <File className="size-4 mr-2 flex-shrink-0" />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="truncate text-sm">
                          {truncateName(fileName)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{fileName}</TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="px-2">
                    <FileActionsMenu
                      fileName={fileName}
                      onRename={handleRename}
                      onDelete={handleDelete}
                    />
                  </div>
                </SidebarMenuButton>
              ))
            ) : (
              <span>No template</span>
            )}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}
