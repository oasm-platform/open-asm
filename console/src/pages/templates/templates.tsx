import { useState } from 'react';

import { SidebarInset, SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { TemplatesSidebar } from './components/templates-sidebar';
import { TemplateEditor } from './components/template-editor';

export default function Templates() {
  return (
    // Rendered as a workspace settings tab: fill the viewport below the
    // settings main padding and the tab's title block (plus the mobile header).
    <div className="flex h-[calc(100svh-10rem)] flex-col overflow-hidden rounded-md border md:h-[calc(100svh-7.5rem)]">
      <SidebarProvider
        className="flex flex-col flex-1 min-h-0"
        style={{ '--sidebar-width': '15rem' } as React.CSSProperties}
      >
        <TemplatesWorkspace />
      </SidebarProvider>
    </div>
  );
}

function TemplatesWorkspace() {
  const { isMobile } = useSidebar();
  // Local, not the sidebar context's open state: that one is saved to the
  // cookie the app's main sidebar reads.
  const [listOpen, setListOpen] = useState(true);
  const showList = isMobile || listOpen;
  return (
    <div className="flex flex-1 min-h-0">
      {showList && <TemplatesSidebar onCollapse={() => setListOpen(false)} />}
      <SidebarInset className="min-w-0 overflow-hidden">
        <TemplateEditor onShowList={!showList ? () => setListOpen(true) : undefined} />
      </SidebarInset>
    </div>
  );
}
