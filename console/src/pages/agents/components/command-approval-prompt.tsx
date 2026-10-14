import type {
  ApprovalDecisionOptions,
  PendingApproval,
} from '@/hooks/use-agent-chat';
import { cn } from '@/lib/utils';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';

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
            ? 'Show less'
            : `Show all (${text.length.toLocaleString()} characters)`}
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
  const isPlan = approval.kind === 'plan';
  const isCommand =
    !isPlan && (!approval.tool || approval.tool === COMMAND_TOOL);
  const toolTitle =
    approval.toolMetadata?.title ?? humanize(approval.tool ?? '');
  const annotations = approval.toolMetadata?.annotations;
  const toolHints = [
    annotations?.readOnlyHint === true ? 'Read-only' : null,
    annotations?.destructiveHint === true ? 'May be destructive' : null,
    annotations?.idempotentHint === true ? 'Idempotent' : null,
    annotations?.openWorldHint === true ? 'Uses external services' : null,
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
            label: 'Yes, run it automatically',
            hint: 'Switches to Auto: commands run without asking',
            run: () => decide('approved', { mode: 'auto' }),
          },
          {
            label: 'Yes, but approve each command',
            hint: 'Switches to Manual: asks before each new command',
            run: () => decide('approved', { mode: 'manual' }),
          },
          { label: 'No', run: () => decide('rejected') },
        ]
      : [
          { label: 'Yes', run: () => decide('approved') },
          // Not for shell commands: "any input" would be any command
          ...(isCommand
            ? []
            : [
                {
                  label: `Yes, allow ${toolTitle} in this conversation`,
                  hint: 'Later calls of this tool run without asking, whatever their input',
                  run: () => decide('approved', { allowTool: true }),
                },
              ]),
          {
            label: 'Yes, allow all requests in this conversation',
            run: () => decide('approved', { allowConversation: true }),
          },
          { label: 'No', run: () => decide('rejected') },
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
        aria-label={isPlan ? 'Plan approval' : 'Permission request'}
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
        className="rounded-xl border bg-card p-4 shadow-sm"
      >
      <div className="flex items-baseline gap-2">
        <DialogPrimitive.Title asChild>
          <h3 className="text-base font-semibold">
            {isPlan
              ? 'Run this plan?'
              : isCommand
                ? 'Run this command?'
                : `Allow ${toolTitle}?`}
          </h3>
        </DialogPrimitive.Title>
        {queueSize > 1 && (
          <span className="ml-auto text-xs text-muted-foreground">
            +{queueSize - 1} more waiting
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
            <span>MCP server: {approval.toolMetadata.server}</span>
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
              'flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50',
              selected === index
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-muted/50 hover:bg-muted',
            )}
          >
            <span className="font-medium opacity-70">{index + 1}</span>
            <span className="flex flex-col">
              <span className={cn(selected === index && 'font-semibold')}>
                {option.label}
              </span>
              {option.hint && (
                <span className="text-xs opacity-70">{option.hint}</span>
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
              ? 'Tell the agent how to change the plan'
              : 'Tell the agent what to do instead'
          }
          className={cn(
            'rounded-lg border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground',
            selected === feedbackIndex && 'border-primary',
          )}
        />
      </div>

      <p className="mt-2 text-xs text-muted-foreground">Esc to cancel</p>
      </DialogPrimitive.Content>
    </DialogPrimitive.Root>
  );
}
