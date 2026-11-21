import type {
  ApprovalDecisionOptions,
  PendingApproval,
} from '@/hooks/use-agent-chat';
import { cn } from '@/lib/utils';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';
import { useT } from '@/lib/i18n-dictionary';

interface CommandApprovalPromptProps {
  approval: PendingApproval;
  /** Total requests waiting, including this one */
  queueSize: number;
  isSubmitting: boolean;
  onDecide: (
    status: 'approved' | 'rejected',
    options?: ApprovalDecisionOptions,
  ) => void;
}

const COMMAND_TOOL = 'execute_remote_command';
/** Longer argument values start collapsed: tool inputs can be megabytes */
const VALUE_PREVIEW_LENGTH = 300;
// The prompt replaces the chat input, so a click or keystroke aimed at the
// input can land on it the moment it appears; ignore input until then.
const ARM_DELAY_MS = 500;
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

function humanize(name: string): string {
  return name
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/** One argument; long values show a preview until expanded. */
function ParamValue({ value }: { value: unknown }) {
  const t = useT();
  const text = formatValue(value);
  const [expanded, setExpanded] = useState(false);
  const long = text.length > VALUE_PREVIEW_LENGTH;
  return (
    <dd className="font-mono break-all">
      {long && !expanded ? `${text.slice(0, VALUE_PREVIEW_LENGTH)}…` : text}
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="ml-1 font-sans text-primary underline-offset-2 hover:underline"
        >
          {expanded
            ? t('agents.approval.showLess')
            : t('agents.approval.showAll', {
                count: text.length.toLocaleString(),
              })}
        </button>
      )}
    </dd>
  );
}

/**
 * Permission prompt that takes the place of the chat input while the agent
 * waits for the user: pick with the mouse, the arrow keys or a number, or type what
 * the agent should do instead. Esc rejects. For a plan (`kind: 'plan'`),
 * approving also picks how it runs: automatically or asking per command.
 */
export function CommandApprovalPrompt({
  approval,
  queueSize,
  isSubmitting,
  onDecide,
}: CommandApprovalPromptProps) {
  const t = useT();
  const isPlan = approval.kind === 'plan';
  const isCommand =
    !isPlan && (!approval.tool || approval.tool === COMMAND_TOOL);
  const toolTitle =
    approval.toolMetadata?.title ?? humanize(approval.tool ?? '');
  const annotations = approval.toolMetadata?.annotations;
  const toolHints = [
    annotations?.readOnlyHint === true ? t('agents.approval.hint.readOnly') : null,
    annotations?.destructiveHint === true ? t('agents.approval.hint.destructive') : null,
    annotations?.idempotentHint === true ? t('agents.approval.hint.idempotent') : null,
    annotations?.openWorldHint === true ? t('agents.approval.hint.openWorld') : null,
  ].filter((hint): hint is string => hint !== null);
  const input =
    approval.input && typeof approval.input === 'object'
      ? (approval.input as Record<string, unknown>)
      : null;
  const params =
    input && !isPlan
      ? Object.entries(input).filter(([k]) => !(isCommand && k === 'command'))
      : [];

  const [selected, setSelected] = useState(-1);
  const [feedback, setFeedback] = useState('');
  const promptRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const feedbackRef = useRef<HTMLInputElement>(null);
  const armedRef = useRef(false);

  useEffect(() => {
    const prompt = promptRef.current;
    if (!prompt) return;

    const keepFocusInside = (event: FocusEvent) => {
      if (event.target instanceof Node && !prompt.contains(event.target)) {
        prompt.focus();
      }
    };

    document.addEventListener('focusin', keepFocusInside);
    prompt.focus();
    return () => document.removeEventListener('focusin', keepFocusInside);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      armedRef.current = true;
    }, ARM_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const decide: typeof onDecide = (status, opts) => {
    if (armedRef.current && !isSubmitting) onDecide(status, opts);
  };

  const options: Array<{ label: string; hint?: string; run: () => void }> =
    isPlan
      ? [
          {
            label: t('agents.approval.runAuto'),
            hint: t('agents.approval.runAutoHint'),
            run: () => decide('approved', { mode: 'auto' }),
          },
          {
            label: t('agents.approval.runManual'),
            hint: t('agents.approval.runManualHint'),
            run: () => decide('approved', { mode: 'manual' }),
          },
          { label: t('agents.approval.no'), run: () => decide('rejected') },
        ]
      : [
          { label: t('agents.approval.yes'), run: () => decide('approved') },
          // Not for shell commands: "any input" would be any command
          ...(isCommand
            ? []
            : [
                {
                  label: t('agents.approval.allowTool', { tool: toolTitle }),
                  hint: t('agents.approval.allowToolHint'),
                  run: () => decide('approved', { allowTool: true }),
                },
              ]),
          {
            label: t('agents.approval.allowAll'),
            run: () => decide('approved', { allowConversation: true }),
          },
          { label: t('agents.approval.no'), run: () => decide('rejected') },
        ];
  // The feedback input comes right after the options
  const feedbackIndex = options.length;

  const submitFeedback = () => {
    const text = feedback.trim();
    decide('rejected', text ? { feedback: text } : undefined);
  };

  useEffect(() => {
    if (selected === feedbackIndex) feedbackRef.current?.focus();
    else if (selected >= 0) optionRefs.current[selected]?.focus();
  }, [selected, feedbackIndex]);

  /** Handles shortcuts and traps Tab only while focus is within the prompt. */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      isSubmitting ||
      e.defaultPrevented ||
      e.nativeEvent.isComposing ||
      e.repeat
    )
      return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const typing = e.target === feedbackRef.current;

    if (e.key === 'Tab') {
      const prompt = promptRef.current;
      if (!prompt) return;
      const focusable = Array.from(
        prompt.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      const active = document.activeElement;

      if (e.shiftKey && (active === prompt || active === first)) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && (active === prompt || active === last)) {
        e.preventDefault();
        first?.focus();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, feedbackIndex));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (typing || selected === feedbackIndex) {
        e.preventDefault();
        submitFeedback();
      } else if (!(e.target instanceof HTMLButtonElement) && selected >= 0) {
        e.preventDefault();
        options[selected]?.run();
      }
    } else if (!typing && /^[1-9]$/.test(e.key) && options[Number(e.key) - 1]) {
      e.preventDefault();
      options[Number(e.key) - 1].run();
    }
  };

  return (
    <DialogPrimitive.Root open>
      <DialogPrimitive.Content
        ref={promptRef}
        role="alertdialog"
        aria-modal="true"
        aria-label={
          isPlan
            ? t('agents.approval.planLabel')
            : t('agents.approval.permissionLabel')
        }
        aria-labelledby={undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          promptRef.current?.focus();
        }}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          decide('rejected');
        }}
        className="rounded-2xl border bg-card p-4 shadow-md outline-none animate-in fade-in-0 slide-in-from-bottom-2 duration-200"
      >
      <div className="flex items-baseline gap-2">
        <DialogPrimitive.Title asChild>
          <h3 className="text-base font-semibold">
            {isPlan
              ? t('agents.approval.runPlan')
              : isCommand
                ? t('agents.approval.runCommand')
                : t('agents.approval.allowToolTitle', { tool: toolTitle })}
          </h3>
        </DialogPrimitive.Title>
        {queueSize > 1 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {t('agents.approval.moreWaiting', { count: queueSize - 1 })}
          </span>
        )}
      </div>

      {approval.description && (
        <p className="mt-1 text-sm text-muted-foreground">
          {approval.description}
        </p>
      )}

      {!isPlan && approval.toolMetadata?.source === 'mcp' && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {approval.toolMetadata.server && (
            <span>
              {t('agents.approval.mcpServer', {
                server: approval.toolMetadata.server,
              })}
            </span>
          )}
          {toolHints.map((hint) => (
            <span key={hint}>{hint}</span>
          ))}
        </div>
      )}

      {isPlan ? (
        <ol className="mt-3 max-h-56 list-decimal space-y-1 overflow-auto rounded-md bg-muted p-2.5 pl-7 text-sm">
          {(approval.plan ?? []).map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
      ) : isCommand ? (
        <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-muted p-2.5 font-mono text-xs whitespace-pre-wrap break-all">
          {approval.command}
        </pre>
      ) : (
        params.length > 0 && (
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md bg-muted p-2.5 text-xs">
            {params.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-muted-foreground">{key}</dt>
                <ParamValue value={value} />
              </div>
            ))}
          </dl>
        )
      )}

      <div className="mt-3 flex flex-col gap-1.5">
        {options.map((option, index) => (
          <button
            key={option.label}
            ref={(element) => {
              optionRefs.current[index] = element;
            }}
            type="button"
            disabled={isSubmitting}
            onClick={option.run}
            onFocus={() => setSelected(index)}
            className={cn(
              'flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm outline-none transition-colors cursor-pointer disabled:opacity-50',
              selected === index
                ? 'border-primary/60 bg-primary/10 text-foreground'
                : 'bg-muted/40 hover:bg-muted',
            )}
          >
            <span
              className={cn(
                'inline-flex size-5 shrink-0 items-center justify-center rounded-md border bg-background font-mono text-[11px] font-medium text-muted-foreground',
                selected === index && 'border-primary/60 text-primary',
              )}
            >
              {index + 1}
            </span>
            <span className="flex flex-col">
              <span className={cn(selected === index && 'font-semibold')}>
                {option.label}
              </span>
              {option.hint && (
                <span className="text-xs text-muted-foreground">
                  {option.hint}
                </span>
              )}
            </span>
          </button>
        ))}

        <input
          ref={feedbackRef}
          value={feedback}
          disabled={isSubmitting}
          onChange={(e) => setFeedback(e.target.value)}
          onFocus={() => setSelected(feedbackIndex)}
          placeholder={
            isPlan
              ? t('agents.approval.planFeedback')
              : t('agents.approval.feedback')
          }
          className={cn(
            'rounded-lg border bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground',
            selected === feedbackIndex && 'border-primary/60 ring-2 ring-primary/15',
          )}
        />
      </div>

      <p className="mt-2.5 text-xs text-muted-foreground">
        {t('agents.approval.keyboardHint')}
      </p>
      </DialogPrimitive.Content>
    </DialogPrimitive.Root>
  );
}
