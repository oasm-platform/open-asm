import { PromptInputTextarea } from '@/components/ai-elements/prompt-input';
import {
  findMentionQuery,
  formatMention,
  splitMentions,
  type MentionKind,
} from '@/components/agent-mentions';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover';
import useDebounce from '@/hooks/use-debounce';
import { cn } from '@/lib/utils';
import { useSearchControllerSearchAssetsTargets } from '@/services/apis/gen/queries';
import { keepPreviousData } from '@tanstack/react-query';
import { Bug, CloudCheck, Target } from 'lucide-react';
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useT } from '@/lib/i18n-dictionary';

interface MentionOption {
  kind: MentionKind;
  id: string;
  label: string;
  detail?: string;
}

const KIND_ICONS: Record<MentionKind, ReactNode> = {
  target: <Target className="size-4 shrink-0" aria-hidden />,
  asset: <CloudCheck className="size-4 shrink-0" aria-hidden />,
  vulnerability: <Bug className="size-4 shrink-0" aria-hidden />,
};

// Same box as the textarea (InputGroupTextarea), so the colored copy behind
// it wraps on the same characters. Form controls do not inherit the body's
// text-rendering (kerning), so the copy is set to the textarea's
const TEXT_BOX =
  'w-full px-3 py-3 text-base md:text-sm whitespace-pre-wrap break-words [text-rendering:auto]';

interface AgentMentionTextareaProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * The chat textarea with "@" mentions: typing "@" and a term searches the
 * workspace like the header search, ↑↓ moves, Enter/Tab picks, Esc closes.
 * A pick inserts `@target:hackerone.com` (see agent-mentions.ts), shown in
 * the primary color and sent to the AI as typed.
 */
export function AgentMentionTextarea({
  value,
  onValueChange,
  placeholder,
  disabled,
}: AgentMentionTextareaProps) {
  const t = useT();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const [caret, setCaret] = useState<number | null>(null);
  // "@" whose list was closed with Esc; it stays closed until a new "@"
  const [dismissedStart, setDismissedStart] = useState<number | null>(null);
  const [active, setActive] = useState({ key: '', index: 0 });

  const mention = caret === null ? null : findMentionQuery(value, caret);
  const isOpen = !!mention && mention.start !== dismissedStart;
  const query = mention?.query ?? '';
  // The highlighted row belongs to one "@" and one term; any other starts at
  // the first row
  const activeKey = `${mention?.start ?? ''}:${query}`;
  const debounced = useDebounce(query.trim(), 250);

  const { data, isFetching, isPlaceholderData } =
    useSearchControllerSearchAssetsTargets(
      { value: debounced, isSaveHistory: false, limit: 5 },
      {
        query: {
          enabled: isOpen && debounced.length > 0,
          placeholderData: keepPreviousData,
        },
      },
    );

  // Results of an older term (kept on screen while the next one loads) are
  // shown but cannot be picked, so a quick Enter never inserts the wrong one
  const isSettled =
    debounced === query.trim() && !isFetching && !isPlaceholderData;

  const options = useMemo<MentionOption[]>(() => {
    const results = data?.data;
    if (!results || query.trim().length === 0) return [];
    return [
      ...results.targets.map((t) => ({
        kind: 'target' as const,
        id: t.id,
        label: t.value,
      })),
      ...results.assets.map((a) => ({
        kind: 'asset' as const,
        id: a.id,
        label: a.value,
      })),
      ...results.vulnerabilities.map((v) => ({
        kind: 'vulnerability' as const,
        id: v.id,
        label: v.name,
        detail: v.severity,
      })),
    ];
  }, [data, query]);

  const activeIndex =
    active.key === activeKey ? Math.min(active.index, options.length - 1) : 0;

  const segments = useMemo(() => splitMentions(value), [value]);
  const hasMentions = segments.some((s) => s.isMention);

  // Puts the caret right after a picked mention once the new value renders
  useLayoutEffect(() => {
    const position = pendingCaretRef.current;
    const textarea = textareaRef.current;
    if (position === null || !textarea) return;
    pendingCaretRef.current = null;
    textarea.focus();
    textarea.setSelectionRange(position, position);
  }, [value]);

  const pick = (option: MentionOption) => {
    if (!mention || caret === null || !isSettled) return;
    const token = `${formatMention(option.kind, option.label)} `;
    const position = mention.start + token.length;
    pendingCaretRef.current = position;
    setCaret(position);
    onValueChange(value.slice(0, mention.start) + token + value.slice(caret));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mention || !isOpen || e.nativeEvent.isComposing) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setDismissedStart(mention.start);
      return;
    }
    if (!isSettled && query.trim().length > 0) {
      // Still searching: Enter waits for the results instead of sending
      if (e.key === 'Enter' && !e.shiftKey) e.preventDefault();
      return;
    }
    if (options.length === 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive({
        key: activeKey,
        index: (activeIndex + step + options.length) % options.length,
      });
    } else if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
      // Prevented, so PromptInputTextarea does not submit the message
      e.preventDefault();
      pick(options[activeIndex]);
    }
  };

  const syncCaret = (textarea: HTMLTextAreaElement) =>
    setCaret(
      textarea.selectionStart === textarea.selectionEnd
        ? textarea.selectionStart
        : null,
    );

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && mention) setDismissedStart(mention.start);
      }}
    >
      <PopoverAnchor asChild>
        <div className="relative w-full">
          {hasMentions && (
            <div
              ref={mirrorRef}
              aria-hidden
              className={cn(
                TEXT_BOX,
                'pointer-events-none absolute inset-0 max-h-48 overflow-hidden text-foreground',
              )}
            >
              {segments.map((segment, i) =>
                segment.isMention ? (
                  // Color only: a bolder weight is wider and would push the
                  // text away from the textarea's caret
                  <span key={i} className="text-primary">
                    {segment.text}
                  </span>
                ) : (
                  <span key={i}>{segment.text}</span>
                ),
              )}
              {/* Keeps a trailing newline as tall as in the textarea */}
              {'​'}
            </div>
          )}
          <PromptInputTextarea
            ref={textareaRef}
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            className={cn(
              'relative w-full',
              hasMentions && 'text-transparent caret-foreground',
            )}
            aria-autocomplete="list"
            aria-expanded={isOpen && options.length > 0}
            onChange={(e) => {
              const textarea = e.currentTarget;
              onValueChange(textarea.value);
              syncCaret(textarea);
              // Once that "@" is gone, a new one at the same place opens again
              if (!findMentionQuery(textarea.value, textarea.selectionStart)) {
                setDismissedStart(null);
              }
            }}
            onSelect={(e) => syncCaret(e.currentTarget)}
            onBlur={() => setCaret(null)}
            onScroll={(e) => {
              if (mirrorRef.current) {
                mirrorRef.current.scrollTop = e.currentTarget.scrollTop;
              }
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        side="top"
        align="start"
        className="w-80 p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        // Clicks in the textarea move the caret; they must not close the list
        onInteractOutside={(e) => {
          if (e.target === textareaRef.current) e.preventDefault();
        }}
      >
        {query.trim().length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">
            {t('agents.mention.hint')}
          </p>
        ) : options.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">
            {isSettled
              ? t('agents.mention.noResults', { query })
              : t('agents.mention.searching')}
          </p>
        ) : (
          <ul
            role="listbox"
            aria-label={t('agents.mention.label')}
            aria-busy={!isSettled}
            className={cn(!isSettled && 'opacity-60')}
          >
            {options.map((option, i) => (
              <li
                key={`${option.kind}-${option.id}`}
                role="option"
                aria-selected={i === activeIndex}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
                  i === activeIndex && 'bg-accent text-accent-foreground',
                )}
                // Keeps the textarea focused, so the caret is still known
                onMouseDown={(e) => e.preventDefault()}
                // Only a pointer that really moves highlights a row: when the
                // list grows, it slides under a still pointer for a frame
                // and the browser fires mouseenter, which picked a wrong row
                onPointerMove={(e) => {
                  if (i === activeIndex) return;
                  if (e.movementX === 0 && e.movementY === 0) return;
                  setActive({ key: activeKey, index: i });
                }}
                onClick={() => pick(option)}
              >
                {KIND_ICONS[option.kind]}
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                <span className="text-xs capitalize text-muted-foreground">
                  {option.detail ?? t(`agents.mention.kind.${option.kind}`)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
