import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TemplatesSidebar } from './components/templates-sidebar';
import { TemplateEditor } from './components/template-editor';

export default function Templates() {
  return (
    // Rendered as a workspace settings tab: fill the viewport below the
    // settings main padding and the tab's title block (plus the mobile header).
    <div className="flex h-[calc(100svh-10rem)] flex-col overflow-hidden rounded-md border md:h-[calc(100svh-7.5rem)]">
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
