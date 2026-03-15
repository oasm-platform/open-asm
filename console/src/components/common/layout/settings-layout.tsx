import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { filterTabGroups, settingsTabGroups } from '@/pages/settings/settings';
import { useSession } from '@/utils/authClient';
import { ArrowLeft, Menu } from 'lucide-react';
import type { JSX, ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

interface SettingsLayoutProps {
  children: ReactNode;
}

export default function SettingsLayout({
  children,
}: SettingsLayoutProps): JSX.Element {
  const location = useLocation();
  const { data } = useSession();
  const visibleGroups = filterTabGroups(settingsTabGroups, data?.user.role);

  // Determine if a tab is active based on current path
  const isActive = (path: string) => location.pathname.startsWith(path);

  // Settings navigation menu content (for both desktop sidebar and mobile sheet)
  const navMenu = (
    <nav className="flex-1 py-3">
      <ul className="space-y-1">
        {visibleGroups.map((group, groupIndex) => (
          <div>
            <li key={group.name} className="p-2">
              {/* Group header */}
              <div className="text-xs font-semibold text-muted-foreground uppercase mb-2 tracking-wider px-3">
                {group.name}
              </div>
              {/* Tabs in this group */}
              {group.tabs.map((tab) => (
                <Link
                  key={tab.id}
                  to={tab.path}
                  className={`block px-3 py-1 rounded-md text-sm font-medium transition-colors mb-1 last:mb-0 ${
                    isActive(tab.path)
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
                >
                  {tab.label}
                </Link>
              ))}
            </li>
            {/* Group divider - shown after group */}
            {groupIndex < visibleGroups.length - 1 && (
              <div className="border-b my-2" />
            )}
          </div>
        ))}
      </ul>
    </nav>
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header with Back To App and menu toggle - always visible */}
      <header className="flex items-center gap-2 p-2 border-b bg-background shrink-0">
        {/* Back To App button - always visible on the left */}
        <Link to="/" className="mr-auto">
          <Button variant="outline" className="hidden md:flex">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back To App
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="md:hidden"
            title="Back To App"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>

        {/* Menu button - only visible on mobile */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden shrink-0">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-64">
            {navMenu}
          </SheetContent>
        </Sheet>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar - always visible on md and above */}
        <aside className="hidden md:flex md:w-64 border-r bg-background flex-col shrink-0">
          {navMenu}
        </aside>

        {/* Main content area */}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
