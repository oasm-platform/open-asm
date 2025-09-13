import { ChevronRight, Command, File, Folder, Plus } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
import { useSetAtom } from 'jotai';
import { useHotkeys } from 'react-hotkeys-hook';
import { addTemplateAtom } from '../atoms';
import { Input } from '@/components/ui/input';
import { useTemplatesControllerGetAllTemplates } from '@/services/apis/gen/queries';

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

function Tree() {
  const { data } = useTemplatesControllerGetAllTemplates({
    limit: 10,
    page: 1,
  });
  if (!data) return 'loading';
  console.log(data);

  const [name, items] = [
    'Workspace templates',
    data.data.map((e) => e.fileName),
  ];

  return (
    <SidebarMenuItem>
      <Collapsible
        className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
        defaultOpen={name === 'components' || name === 'ui'}
      >
        <CollapsibleTrigger asChild>
          <SidebarMenuButton>
            <ChevronRight className="transition-transform" />
            <Folder />
            {name}
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {items.length > 0 ? (
              items.map((name) => (
                <SidebarMenuButton
                  isActive={name === 'button.tsx'}
                  className="data-[active=true]:bg-transparent"
                >
                  <File />
                  {name}
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
