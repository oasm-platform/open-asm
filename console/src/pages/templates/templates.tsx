import Page from '@/components/common/page';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { TemplatesSidebar } from './components/templates-sidebar';
import { TemplateEditor } from './components/template-editor';

export default function Templates() {
  // Sets the workspace id on the x-header.
  useWorkspaceSelector();

  return (
    // Fill the viewport below the app header (h-14) and the layout's main padding.
    <Page
      title="Templates"
      description="Custom nuclei templates for this workspace"
      permission="artifact.read"
      className="h-[calc(100svh-5.5rem)] md:h-[calc(100svh-6.5rem)]"
    >
      <div className="flex h-full flex-col overflow-hidden rounded-md border">
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
    </Page>
  );
}
