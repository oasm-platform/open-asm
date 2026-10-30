import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { TemplatesSidebar } from './components/templates-sidebar';
import { TemplateEditor } from './components/template-editor';

export default function Templates() {
  // Sets the workspace id on the x-header.
  useWorkspaceSelector();

  return (
    <div className="h-screen flex flex-col">
      <SidebarProvider
        className="flex flex-col flex-1 min-h-0"
        style={{ '--sidebar-width': '20rem' } as React.CSSProperties}
      >
        <div className="flex flex-1 min-h-0">
          <TemplatesSidebar />
          <SidebarInset className="overflow-hidden">
            <TemplateEditor />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}
