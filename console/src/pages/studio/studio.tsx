import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import Editor from './components/editor';
import { EditorTabs } from './components/editor-tabs';
import { StudioSidebar } from './components/studio-sidebar';

export default function Studio() {
  return (
    <div>
      <SidebarProvider
        className="flex flex-col min-h-0"
        style={
          {
            '--sidebar-width': '20rem',
          } as React.CSSProperties
        }
      >
        <div className="flex flex-1">
          <StudioSidebar />
          <SidebarInset>
            <div className="flex flex-1 flex-col">
              <EditorTabs />
              <Editor />
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}
