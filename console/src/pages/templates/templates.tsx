import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { TemplatesSidebar } from './components/templates-sidebar';
import { useTemplateTabs } from './hooks/use-template-tabs';

export default function Templates() {
  // Sets the workspace id on the x-header.
  useWorkspaceSelector();
  const { tabs, activeId } = useTemplateTabs();
  const active = tabs.find((t) => t.id === activeId);

  return (
    <div className="h-screen flex flex-col">
      <SidebarProvider
        className="flex flex-col flex-1 min-h-0"
        style={{ '--sidebar-width': '20rem' } as React.CSSProperties}
      >
        <div className="flex flex-1 min-h-0">
          <TemplatesSidebar />
          <SidebarInset className="overflow-hidden">
            {/* Placeholder: Task 6 replaces this with the template editor. */}
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {active?.name ?? 'Select a template or create a new one'}
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}
