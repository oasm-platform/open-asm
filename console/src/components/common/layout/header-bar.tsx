// HeaderBar - Sticky header component without children wrapper

import { AiChatPanelToggle } from '@/components/ai-chat-panel/ai-chat-panel-toggle';
import { NotificationBell } from '@/components/notifications/notification-bell';
import AppLogo from '@/components/ui/app-logo';
import { NavUser } from '@/components/ui/nav-user';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { CommandPalette } from '../../common/command-palette';
import { ThemeSwitch } from '@/components/ui/theme-switch-icon';
import { cn } from '@/lib/utils';
import { useEffect, useRef, type RefObject } from 'react';

interface HeaderBarProps {
  className?: string;
}

/** Scroll over which the dark header's frosted fill builds up */
const HEADER_FADE_PX = 96;

/**
 * Sets `--header-progress` on the header: 0 at the top of the page, rising
 * with the scroll to 1 at HEADER_FADE_PX. Written straight to the element
 * once a frame, so scrolling re-renders nothing.
 */
function useHeaderScrollProgress(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const progress = Math.min(Math.max(window.scrollY / HEADER_FADE_PX, 0), 1);
      ref.current?.style.setProperty('--header-progress', String(progress));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [ref]);
}

export function HeaderBar({ className }: HeaderBarProps) {
  const { isMobile } = useSidebar();
  const { workspaces } = useWorkspaceSelector();
  const isHasWorkspace = workspaces?.length > 0;
  const headerRef = useRef<HTMLElement>(null);
  useHeaderScrollProgress(headerRef);
  return (
    <header
      ref={headerRef}
      className={cn(
        'sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-background/70 px-4 backdrop-blur-xl transition-colors supports-[backdrop-filter]:bg-background/55',
        // Dark mode: no line, and see-through at the top of the page so the
        // page glow runs under it; the frosted fill builds up with the scroll
        // (--header-progress) to the same fill and blur as light mode's.
        'dark:border-transparent dark:bg-[color-mix(in_oklab,var(--background)_calc(var(--header-progress,0)*70%),transparent)] dark:backdrop-blur-[calc(var(--header-progress,0)*24px)] dark:supports-[backdrop-filter]:bg-[color-mix(in_oklab,var(--background)_calc(var(--header-progress,0)*55%),transparent)]',
        className,
      )}
    >
      {isHasWorkspace ? (
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="max-md:scale-125" />
            {isMobile && <AppLogo type="small" />}
          </div>
          {/* Mobile: the search icon joins the buttons on the right, at
              their spacing (gap-3 of the row less 8px = their gap-1) */}
          <div className="flex min-w-0 items-center max-md:-mr-2 max-md:ml-auto md:flex-1 md:justify-center">
            <CommandPalette />
          </div>
          <div className="flex items-center gap-1">
            <AiChatPanelToggle />
            <ThemeSwitch />
            <NotificationBell />
          </div>
        </div>
      ) : (
        <div className="flex w-full items-center justify-end gap-2">
          <AppLogo type="small" />
          <div className="ml-auto">
            <NavUser isOnlyAvatar dropdownSide="bottom" />
          </div>
        </div>
      )}
    </header>
  );
}
