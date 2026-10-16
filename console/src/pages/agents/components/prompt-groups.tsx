import { cn } from '@/lib/utils';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PromptGroup } from './landing-constants';

interface PromptGroupsProps {
  /** The topic groups to show (differs between Ask and Agent mode). */
  groups: PromptGroup[];
  /** Called with the prompt the user picked. */
  onSelect: (prompt: string) => void;
  /**
   * Called with the prompt under the pointer (or keyboard focus), and with
   * null once nothing is previewed, e.g. to mirror it in the input placeholder.
   */
  onPreview?: (prompt: string | null) => void;
  /**
   * Close the panel after a prompt is picked. False keeps it open, e.g. when
   * picking only fills the input so the user can keep choosing. Default true.
   */
  closeOnSelect?: boolean;
  className?: string;
}

/**
 * Starter prompts under the landing input: a row of topic chips; picking one
 * swaps the row for a panel listing that topic's prompts. X, Escape or a click
 * outside goes back to the chips, as does picking a prompt when closeOnSelect.
 */
export function PromptGroups({
  groups,
  onSelect,
  onPreview,
  closeOnSelect = true,
  className,
}: PromptGroupsProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const active = groups.find((group) => group.id === activeId);

  // A closing panel unmounts under the pointer without a mouseleave, so drop
  // any preview whenever the open group changes.
  useEffect(() => {
    onPreview?.(null);
  }, [activeId, onPreview]);

  // Switching mode swaps the groups, so close any open panel.
  useEffect(() => {
    setActiveId(null);
  }, [groups]);

  useEffect(() => {
    if (!activeId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveId(null);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setActiveId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [activeId]);

  const fade = reduceMotion
    ? { initial: false as const }
    : {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -6 },
        transition: { duration: 0.18 },
      };

  return (
    // popLayout: the outgoing view leaves the flow at once, so chips and
    // panel swap in place
    <div ref={rootRef} className={cn('relative', className)}>
      <AnimatePresence initial={false} mode="popLayout">
        {active ? (
          <motion.div
            key={active.id}
            {...fade}
            className="mx-2 overflow-hidden rounded-2xl border bg-card shadow-sm"
          >
            <div className="flex items-center justify-between pl-4 pr-2 pt-2.5 pb-1">
              <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <active.icon className="size-3.5" />
                {active.label}
              </span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setActiveId(null)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>
            {/* Cleared on leaving the list, not each item, so crossing the
                gaps between items doesn't flash the default placeholder */}
            <ul
              aria-label={`${active.label} prompts`}
              onMouseLeave={() => onPreview?.(null)}
              className="max-h-[min(20rem,40vh)] overflow-y-auto px-2 pb-2"
            >
              {active.prompts.map((prompt) => (
                <li
                  key={prompt}
                  className="border-b border-border/60 last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (closeOnSelect) setActiveId(null);
                      onSelect(prompt);
                    }}
                    onMouseEnter={() => onPreview?.(prompt)}
                    onFocus={() => onPreview?.(prompt)}
                    onBlur={() => onPreview?.(null)}
                    className="my-0.5 w-full rounded-lg px-2 py-2 text-left text-sm text-foreground/90 transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
                  >
                    {prompt}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        ) : (
          <motion.div
            key="chips"
            {...fade}
            className="grid grid-cols-3 gap-2"
          >
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => setActiveId(group.id)}
                className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-lg border bg-muted px-3 py-1.5 text-sm font-medium text-foreground/90 transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
              >
                <group.icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{group.label}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
