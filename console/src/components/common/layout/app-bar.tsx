// AppBar - Layout wrapper for children content (without header)
// For pages using AppBar with header, use HeaderBar + AppContent instead

import type { JSX } from 'react';

import { SidebarInset } from '@/components/ui/sidebar';

export default function AppBar({ children }: { children: JSX.Element }) {
  return (
    <SidebarInset>
      <div className="flex flex-1 flex-col gap-4 p-4">{children}</div>
    </SidebarInset>
  );
}
