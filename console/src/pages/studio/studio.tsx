import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import Editor from './components/editor';
import { EditorTabs } from './components/editor-tabs';
import { StudioSidebar } from './components/studio-sidebar';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';

export default function Studio() {
  //Set workspace id to x-header
  useWorkspaceSelector();

  return (
    <div className="h-screen flex flex-col">
      <SidebarProvider
        className="flex flex-col flex-1 min-h-0"
        style={
          {
            '--sidebar-width': '20rem',
          } as React.CSSProperties
        }
      >
        <div className="flex flex-1 min-h-0">
          <StudioSidebar />
          <SidebarInset className="overflow-hidden">
            <div className="flex flex-1 flex-col min-h-0">
              <EditorTabs />
              <Editor />
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}
