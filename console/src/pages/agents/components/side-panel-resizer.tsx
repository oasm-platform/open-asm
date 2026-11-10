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

/** Narrowest the chat may get beside the panel */
export const CHAT_MIN_WIDTH = 420;
/** Narrowest the side panel may get */
export const SIDE_PANEL_MIN_WIDTH = 360;
const STORAGE_KEY = 'agent-side-panel-width';
const KEY_STEP = 24;

const readWidth = (): number | null => {
  try {
    const n = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
};

const saveWidth = (width: number | null) => {
  try {
    if (width === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(Math.round(width)));
  } catch {
    // storage unavailable: the width lasts for this page only
  }
};

/** Keeps both sides at least their minimum inside a row `total` wide */
export function clampPanelWidth(width: number, total: number): number {
  const max = Math.max(SIDE_PANEL_MIN_WIDTH, total - CHAT_MIN_WIDTH);
  return Math.min(Math.max(width, SIDE_PANEL_MIN_WIDTH), max);
}

/**
 * Width of the side panel in a split row, set by dragging the divider and
 * kept per browser. `null` until the user drags: the panel keeps its default
 * CSS width then.
 */
export function useSidePanelWidth(rowRef: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState<number | null>(readWidth);

  // A smaller window must not squeeze the chat under its minimum
  useEffect(() => {
    const row = rowRef.current;
    if (!row || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      // Hidden below lg: nothing to clamp against
      if (row.clientWidth === 0) return;
      setWidth((w) => (w === null ? w : clampPanelWidth(w, row.clientWidth)));
    });
    observer.observe(row);
    return () => observer.disconnect();
  }, [rowRef]);

  const update = useCallback(
    (next: number | null) => {
      const row = rowRef.current;
      const value =
        next === null || !row ? next : clampPanelWidth(next, row.clientWidth);
      setWidth(value);
      return value;
    },
    [rowRef],
  );

  return { width, setWidth: update, save: saveWidth };
}

interface SidePanelResizerProps {
  rowRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  width: number | null;
  onResize: (width: number | null) => number | null;
  onCommit: (width: number | null) => void;
}

/**
 * The divider between the chat and the side panel: drag it (or use the arrow
 * keys) to share the row, double-click to go back to the default split.
 */
export function SidePanelResizer({
  rowRef,
  panelRef,
  width,
  onResize,
  onCommit,
}: SidePanelResizerProps) {
  // While dragging, the width goes straight onto the panel's style, once
  // per frame: a React render of the whole chat page per pointer move is
  // what makes a drag lag. State is set once, on release.
  const drag = useRef<{
    startX: number;
    startWidth: number;
    total: number;
    last: number;
    frame: number;
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
      frame: 0,
    };
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    // The panel is on the right: moving left widens it
    d.last = clampPanelWidth(d.startWidth + (d.startX - e.clientX), d.total);
    if (d.frame) return;
    d.frame = requestAnimationFrame(() => {
      d.frame = 0;
      if (panelRef.current) panelRef.current.style.width = `${d.last}px`;
    });
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (d.frame) cancelAnimationFrame(d.frame);
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
      aria-label="Resize side panel"
      aria-valuemin={SIDE_PANEL_MIN_WIDTH}
      aria-valuemax={total ? Math.max(SIDE_PANEL_MIN_WIDTH, total - CHAT_MIN_WIDTH) : undefined}
      aria-valuenow={width ?? undefined}
      tabIndex={0}
      title="Drag to resize, double-click to reset"
      className={cn(
        'group relative z-10 -mx-1 hidden w-2 shrink-0 cursor-col-resize touch-none outline-none lg:block',
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
