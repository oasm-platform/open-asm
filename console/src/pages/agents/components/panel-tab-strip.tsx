import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import {
  useCallback,
  useLayoutEffect,
  useRef,
  type ComponentProps,
  type ReactNode,
} from 'react';

const FADE = '1.5rem';

/**
 * Fades the edge a tab strip can still scroll toward, and keeps the selected
 * tab in view, so a strip too narrow for its tabs never hides one silently.
 */
function useScrollableStrip(value: string | undefined) {
  const ref = useRef<HTMLDivElement | null>(null);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    el.style.maskImage =
      start || end
        ? `linear-gradient(to right, ${start ? 'transparent' : '#000'}, #000 ${FADE}, #000 calc(100% - ${FADE}), ${end ? 'transparent' : '#000'})`
        : '';
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    const resize =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    // The tabs too: a label or count can outgrow the strip without
    // resizing it
    resize?.observe(el);
    el.querySelectorAll('[data-slot="tabs-trigger"]').forEach((tab) =>
      resize?.observe(tab),
    );
    return () => {
      el.removeEventListener('scroll', update);
      resize?.disconnect();
    };
  }, [update]);

  useLayoutEffect(() => {
    const active = ref.current?.querySelector<HTMLElement>(
      '[data-slot="tabs-trigger"][data-state="active"]',
    );
    // jsdom has no scrollIntoView
    active?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    update();
  }, [value, update]);

  return ref;
}

/**
 * A tab row for a narrow, resizable panel. Labels differ a lot in length
 * between languages, so the triggers never depend on them fitting: each tab
 * is its icon (and count), the selected one adds its label when the strip
 * has room (`labelFrom`), and the strip scrolls with faded edges as a last
 * resort instead of wrapping or pushing what follows it out.
 */
export function PanelTabStrip({
  value,
  className,
  children,
  ...props
}: {
  /** The selected tab, to keep it scrolled into view */
  value: string;
  className?: string;
  children: ReactNode;
} & Pick<ComponentProps<typeof TabsList>, 'aria-label'>) {
  const ref = useScrollableStrip(value);
  return (
    <TabsList
      ref={ref}
      className={cn(
        'no-scrollbar h-full min-w-0 shrink justify-start overflow-x-auto overflow-y-hidden',
        className,
      )}
      {...props}
    >
      {children}
    </TabsList>
  );
}

/** When the selected tab shows its label, by the width of `@container/tabs` */
type LabelFrom = 'always' | 'md';

const LABEL_SHOWN: Record<LabelFrom, string> = {
  always: 'max-w-40 truncate',
  // Below 28rem the strip only has room for icons and counts
  // and from 42rem for a long label in full
  md: 'sr-only @md/tabs:not-sr-only @md/tabs:max-w-28 @2xl/tabs:max-w-40 @md/tabs:truncate',
};

/**
 * One tab of a `PanelTabStrip`: its icon, the label as a tooltip, and the
 * label inline only while selected. The label stays the accessible name.
 */
export function PanelTab({
  value,
  active,
  icon: Icon,
  label,
  labelFrom = 'md',
  badge,
  badgeClassName,
  className,
}: {
  value: string;
  active: boolean;
  icon?: LucideIcon;
  label: string;
  labelFrom?: LabelFrom;
} & Pick<
  ComponentProps<typeof TabsTrigger>,
  'badge' | 'badgeClassName' | 'className'
>) {
  return (
    <Tooltip>
      {/* A wrapper, not the trigger itself: asChild would hand the tooltip's
          data-state to the tab and break the selection styles */}
      <TooltipTrigger asChild>
        <span className="inline-flex h-full shrink-0">
          <TabsTrigger
            value={value}
            badge={badge}
            badgeClassName={badgeClassName}
            className={cn('h-full', className)}
          >
            {Icon && <Icon />}
            <span
              data-slot="tab-label"
              className={cn(
                // sr-only's reset (not-sr-only) sets white-space: normal;
                // a label never wraps
                'whitespace-nowrap',
                active || !Icon ? LABEL_SHOWN[Icon ? labelFrom : 'always'] : 'sr-only',
              )}
            >
              {label}
            </span>
          </TabsTrigger>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
