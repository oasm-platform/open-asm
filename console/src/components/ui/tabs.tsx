import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as React from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';

import { cn } from '@/lib/utils';

type QueryTabOptions = {
  /** Search-param key. Defaults to 'tab'. Pass 'tab1', 'tab2', ... when a page hosts multiple tab groups. */
  tabParam?: string;
  /** Fallback when the URL value is missing or invalid. */
  defaultValue?: string;
  /** Allowed values — an out-of-list URL value falls back to defaultValue. */
  validValues?: string[];
};

function useQueryTab({
  tabParam = 'tab',
  defaultValue,
  validValues,
}: QueryTabOptions & { tabParam?: string }) {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, unknown>;

  const raw = search[tabParam];
  // When validValues is given it is the source of truth for what renders: a
  // fallback outside that list leaves Radix with a value no trigger/content
  // owns, so no panel mounts. Prefer defaultValue only when it actually exists.
  const fallback = validValues
    ? (validValues.includes(defaultValue ?? '')
        ? defaultValue
        : validValues?.[0]) ?? ''
    : (defaultValue ?? '');
  const value =
    typeof raw === 'string' &&
    (!validValues || validValues.includes(raw)) &&
    raw
      ? raw
      : fallback;

  const setValue = React.useCallback(
    (next: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      navigate({ search: { ...search, [tabParam]: next } as any, replace: true });
    },
    // `search` intentionally omitted — spreading a fresh read each render
    // avoids a navigate loop on back/forward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate, tabParam],
  );

  // Strip the tab search-param when navigating away so other pages don't
  // inherit it. Defer the cleanup by one microtask: React StrictMode performs
  // a setup -> cleanup -> setup cycle during development, and deleting the
  // query in that synthetic cleanup loses the tab restored from the URL.
  const mountedRef = React.useRef(false);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      queueMicrotask(() => {
        if (mountedRef.current) return;
        navigate({
          search: (prev: Record<string, unknown>) => {
            const next = { ...prev };
            delete next[tabParam];
            return next;
          },
          replace: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      });
    };
    // Only on unmount — navigate and tabParam are stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [value, setValue] as const;
}

function Tabs({
  className,
  tabParam,
  defaultValue,
  validValues,
  value: controlledValue,
  onValueChange,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root> & QueryTabOptions) {
  // Opt-in URL sync: no router hooks unless tabParam/defaultValue/validValues requested.
  if (!tabParam && defaultValue === undefined && !validValues) {
    return (
      <TabsPrimitive.Root
        data-slot="tabs"
        className={cn('flex flex-col gap-2', className)}
        value={controlledValue}
        onValueChange={onValueChange}
        {...props}
      />
    );
  }

  return (
    <QueryTabsInner
      className={className}
      tabParam={tabParam}
      defaultValue={defaultValue}
      validValues={validValues}
      value={controlledValue}
      onValueChange={onValueChange}
      {...props}
    />
  );
}

function QueryTabsInner({
  className,
  tabParam,
  defaultValue,
  validValues,
  value: controlledValue,
  onValueChange,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root> & QueryTabOptions) {
  const [queryValue, setQueryValue] = useQueryTab({
    tabParam: tabParam ?? 'tab',
    defaultValue:
      defaultValue ??
      (typeof controlledValue === 'string' ? controlledValue : undefined),
    validValues,
  });

  const handleChange = (next: string) => {
    setQueryValue(next);
    onValueChange?.(next);
  };

  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('flex flex-col gap-2', className)}
      value={controlledValue ?? queryValue}
      onValueChange={handleChange}
      {...props}
    />
  );
}

/** Windows 11 selection indicator: stretch toward the new tab, then settle */
const INDICATOR_MS = 360;
/** Share of the move spent stretching; the rest pulls the trailing edge in */
const INDICATOR_STRETCH = 0.4;
/** Fluent's decelerate curve: a fast shot, a soft landing */
const INDICATOR_EASING = 'cubic-bezier(0.1, 0.9, 0.2, 1)';

interface IndicatorBox {
  left: number;
  width: number;
}

const boxFrame = ({ left, width }: IndicatorBox) => ({
  left: `${left}px`,
  width: `${width}px`,
});

/**
 * Keeps the list's underline under the selected tab. On a tab change it
 * shoots its leading edge to the far side of the new tab, then pulls its
 * trailing edge in, as Windows 11's tabs do. Watches the triggers' state, so
 * clicks, keys, URL and controlled changes all animate, and re-measures when
 * the tabs resize (badge counts, fonts, container width).
 */
function useTabIndicator(enabled: boolean) {
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const barRef = React.useRef<HTMLSpanElement | null>(null);

  React.useLayoutEffect(() => {
    const list = listRef.current;
    const bar = barRef.current;
    if (!enabled || !list || !bar) return;

    const reducedMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    );
    const triggers = () =>
      Array.from(
        list.querySelectorAll<HTMLElement>('[data-slot="tabs-trigger"]'),
      ).filter((t) => t.closest('[data-slot="tabs-list"]') === list);
    let shown: IndicatorBox | null = null;

    const place = (animate: boolean) => {
      const active = triggers().find((t) => t.dataset.state === 'active');
      if (!active) {
        bar.style.opacity = '0';
        shown = null;
        return;
      }
      const next = { left: active.offsetLeft, width: active.offsetWidth };
      const from = shown;
      shown = next;
      bar.style.opacity = '1';
      Object.assign(bar.style, boxFrame(next));

      if (
        !animate ||
        !from ||
        reducedMotion?.matches ||
        typeof bar.animate !== 'function' ||
        (from.left === next.left && from.width === next.width)
      ) {
        return;
      }
      // The edge facing the move shoots to the new tab's far side first
      const stretch =
        next.left > from.left
          ? { left: from.left, width: next.left + next.width - from.left }
          : { left: next.left, width: from.left + from.width - next.left };
      bar.getAnimations().forEach((animation) => animation.cancel());
      bar.animate(
        [
          { ...boxFrame(from), easing: INDICATOR_EASING },
          {
            ...boxFrame(stretch),
            offset: INDICATOR_STRETCH,
            easing: INDICATOR_EASING,
          },
          boxFrame(next),
        ],
        { duration: INDICATOR_MS },
      );
    };

    place(false);
    const resize =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => place(false));
    const watchSizes = () => {
      resize?.observe(list);
      triggers().forEach((t) => resize?.observe(t));
    };
    watchSizes();
    const states = new MutationObserver(() => {
      watchSizes();
      place(true);
    });
    states.observe(list, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-state'],
    });
    return () => {
      states.disconnect();
      resize?.disconnect();
    };
  }, [enabled]);

  return { listRef, barRef };
}

function TabsList({
  className,
  ref,
  children,
  indicator = true,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & {
  /** False for lists that mark the selected tab themselves (pills, vertical lists) */
  indicator?: boolean;
}) {
  const { listRef, barRef } = useTabIndicator(indicator);
  const setRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      listRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [listRef, ref],
  );

  return (
    <TabsPrimitive.List
      ref={setRef}
      data-slot="tabs-list"
      className={cn(
        // Spacing lives here as a gap, not as trigger padding, so the first
        // label starts flush with the content aligned under it
        'text-muted-foreground relative inline-flex h-9 w-fit items-center justify-center gap-4',
        className,
      )}
      {...props}
    >
      {children}
      {indicator && (
        <span
          ref={barRef}
          aria-hidden
          data-slot="tabs-indicator"
          className="pointer-events-none absolute bottom-0 left-0 h-0.5 w-0 rounded-full bg-primary opacity-0"
        />
      )}
    </TabsPrimitive.List>
  );
}

function TabsTrigger({
  className,
  badge,
  badgeClassName,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger> & {
  /** A count or short text after the label, e.g. `12` or `3/5`. */
  badge?: React.ReactNode;
  badgeClassName?: string;
}) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        // The underline is TabsList's indicator, spanning the whole trigger
        "data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring text-muted-foreground inline-flex h-[calc(100%-1px)] items-center justify-center gap-1.5 relative px-0 py-1 text-sm font-medium whitespace-nowrap focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 cursor-pointer hover:text-foreground transition-colors",
        className,
      )}
      {...props}
    >
      {children}
      {badge != null && badge !== false && (
        <>
          {/* Not rendered in the flex row; keeps "Assets 12" as the accessible name. */}{' '}
          <span
            data-slot="tabs-badge"
            className={cn(
              'rounded-full bg-muted px-1.5 py-px text-[11px] font-medium tabular-nums text-muted-foreground',
              badgeClassName,
            )}
          >
            {badge}
          </span>
        </>
      )}
    </TabsPrimitive.Trigger>
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('flex-1 outline-none', className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger, useQueryTab };
export type { QueryTabOptions };
