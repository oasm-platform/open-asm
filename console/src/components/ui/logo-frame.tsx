import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface LogoFrameProps {
  /** The logo itself — `ToolLogo`, `Image`, or any fixed-size mark. */
  children: ReactNode;
  /** Extra frame classes, e.g. `shrink-0 overflow-hidden`. */
  className?: string;
}

/**
 * Tile behind a logo. The frame is white in dark mode so dark, monochrome marks
 * stay legible against the page; `p-[3px]` insets the inner icon from the
 * rounded frame.
 *
 * `light:` has no registered variant in this project (only `dark` — see
 * src/styles/index.css), so `light:bg-black` compiles to nothing today. It is
 * kept verbatim so this frame stays identical to the markup it replaces.
 */
export function LogoFrame({ children, className }: LogoFrameProps) {
  return (
    <div
      className={cn(
        'light:bg-black dark:bg-white rounded-lg p-[3px]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export default LogoFrame;
