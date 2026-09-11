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
  const value =
    typeof raw === 'string' &&
    (!validValues || validValues.includes(raw)) &&
    raw
      ? raw
      : (defaultValue ?? validValues?.[0] ?? '');

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

  // Strip the tab search-param when navigating away so other pages don't inherit it.
  React.useEffect(() => {
    return () => {
      navigate({
        search: (prev: Record<string, unknown>) => {
          const next = { ...prev };
          delete next[tabParam];
          return next;
        },
        replace: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
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

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'text-muted-foreground inline-flex h-9 w-fit items-center justify-center',
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-1/2 data-[state=active]:after:-translate-x-1/2 data-[state=active]:after:h-0.5 data-[state=active]:after:w-5 data-[state=active]:after:bg-primary data-[state=active]:after:rounded-full data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 relative px-2 py-1 text-sm font-medium whitespace-nowrap focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 cursor-pointer hover:text-foreground transition-colors",
        className,
      )}
      {...props}
    />
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
