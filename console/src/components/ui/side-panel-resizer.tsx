import { cn } from '@/lib/utils';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';

const KEY_STEP = 24;

/** Narrowest each side of a split row may get */
export interface PanelLimits {
  /** The panel on the right */
  panelMin: number;
  /** Everything left of it */
  restMin: number;
}

const readWidth = (storageKey: string): number | null => {
  try {
    const n = Number(localStorage.getItem(storageKey));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
};

const saveWidth = (storageKey: string, width: number | null) => {
  try {
    if (width === null) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, String(Math.round(width)));
  } catch {
    // storage unavailable: the width lasts for this page only
  }
};

/** Keeps both sides at least their minimum inside a row `total` wide */
export function clampPanelWidth(
  width: number,
  total: number,
  { panelMin, restMin }: PanelLimits,
): number {
  const max = Math.max(panelMin, total - restMin);
  return Math.min(Math.max(width, panelMin), max);
}

interface SidePanelWidthOptions {
  /** localStorage key the dragged width is kept under */
  storageKey: string;
  limits: PanelLimits;
}

/**
 * Width of a panel on the right of a split row, set by dragging the divider
 * and kept per browser. `null` until the user drags: the panel keeps its
 * default CSS width then.
 */
export function useSidePanelWidth(
  rowRef: RefObject<HTMLElement | null>,
  { storageKey, limits }: SidePanelWidthOptions,
) {
  const [width, setWidth] = useState<number | null>(() =>
    readWidth(storageKey),
  );
  const { panelMin, restMin } = limits;

  // A smaller window must not squeeze the rest of the row under its minimum
  useEffect(() => {
    const row = rowRef.current;
    if (!row || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      // Hidden (e.g. on small screens): nothing to clamp against
      if (row.clientWidth === 0) return;
      setWidth((w) =>
        w === null
          ? w
          : clampPanelWidth(w, row.clientWidth, { panelMin, restMin }),
      );
    });
    observer.observe(row);
    return () => observer.disconnect();
  }, [rowRef, panelMin, restMin]);

  const update = useCallback(
    (next: number | null) => {
      const row = rowRef.current;
      const value =
        next === null || !row
          ? next
          : clampPanelWidth(next, row.clientWidth, { panelMin, restMin });
      setWidth(value);
      return value;
    },
    [rowRef, panelMin, restMin],
  );

  const save = useCallback(
    (next: number | null) => saveWidth(storageKey, next),
    [storageKey],
  );

  return { width, setWidth: update, save };
}

interface SidePanelResizerProps {
  rowRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  width: number | null;
  onResize: (width: number | null) => number | null;
  onCommit: (width: number | null) => void;
  /** Same limits as given to useSidePanelWidth */
  limits: PanelLimits;
  /** Accessible name of the divider */
  label: string;
  /** E.g. `hidden lg:block` to show it on large screens only */
  className?: string;
}

/**
 * The divider between the content of a split row and the panel on its right:
 * drag it (or use the arrow keys) to share the row, double-click to go back
 * to the default split.
 */
export function SidePanelResizer({
  rowRef,
  panelRef,
  width,
  onResize,
  onCommit,
  limits,
  label,
  className,
}: SidePanelResizerProps) {
  // While dragging, the width goes straight onto the panel's style: a React
  // render of the whole page per pointer move is what makes a drag lag.
  // It is written in the move itself, not a frame later: browsers already
  // deliver pointer moves once per frame, and nothing reads layout here, so
  // the edge stays under the pointer. State is set once, on release.
  const drag = useRef<{
    startX: number;
    startWidth: number;
    total: number;
    last: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const startWidth = panelRef.current?.getBoundingClientRect().width ?? width;
    if (!startWidth) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    // The default split caps the panel on wide screens; a drag lifts the cap
    if (panelRef.current) panelRef.current.style.maxWidth = 'none';
    drag.current = {
      startX: e.clientX,
      startWidth,
      total: rowRef.current?.clientWidth ?? 0,
      last: startWidth,
    };
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    // The panel is on the right: moving left widens it
    const next = clampPanelWidth(
      d.startWidth + (d.startX - e.clientX),
      d.total,
      limits,
    );
    if (next === d.last) return;
    d.last = next;
    if (panelRef.current) panelRef.current.style.width = `${next}px`;
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (panelRef.current) panelRef.current.style.maxWidth = '';
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    onCommit(onResize(d.last));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const current = panelRef.current?.getBoundingClientRect().width ?? width ?? 0;
    const next = onResize(current + (e.key === 'ArrowLeft' ? KEY_STEP : -KEY_STEP));
    onCommit(next);
  };

  // Keep the col-resize cursor and stop text selection while dragging, even
  // when the pointer runs ahead of the divider
  useEffect(() => {
    if (!dragging) return;
    const { cursor, userSelect } = document.body.style;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
    };
  }, [dragging]);

  const total = rowRef.current?.clientWidth ?? 0;
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={limits.panelMin}
      aria-valuemax={total ? Math.max(limits.panelMin, total - limits.restMin) : undefined}
      aria-valuenow={width ?? undefined}
      tabIndex={0}
      title="Drag to resize, double-click to reset"
      className={cn(
        'group relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize touch-none outline-none',
        className,
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => {
        onResize(null);
        onCommit(null);
      }}
      onKeyDown={onKeyDown}
    >
      <div
        className={cn(
          'absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors',
          'group-hover:w-0.5 group-hover:bg-primary/60 group-focus-visible:w-0.5 group-focus-visible:bg-primary',
          dragging && 'w-0.5 bg-primary',
        )}
      />
    </div>
  );
}
