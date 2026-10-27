import { AgentModeToggle } from '@/components/ui/agent-mode-toggle';
import LogoFrame from '@/components/ui/logo-frame';
import ToolLogo from '@/components/ui/tool-logo';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { cn } from '@/lib/utils';
import { useToolsControllerGetManyTools } from '@/services/apis/gen/queries';
import { Link } from '@tanstack/react-router';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Box } from 'lucide-react';
import { useEffect, useState } from 'react';

/** Logos shown at once; the window rotates through every agent tool. */
const VISIBLE_LOGOS = 5;
/** The window moves one tool forward this often. */
const ROTATE_INTERVAL_MS = 1000;
/** Steps the window rotates before settling on the "Connectors" label. */
const ROTATION_STEPS = 10;
/** Same query as the Connectors page, so both share one cached request. */
const AGENT_TOOLS_LIMIT = 100;

/** "subfinder" → "Subfinder"; the rest of the name is kept as is. */
function upperFirst(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

interface AgentToolsTrayProps {
  agentMode: string;
  onAgentModeChange: (mode: string) => void;
  onWorkerChange?: (workerId: string | null) => void;
  className?: string;
}

/**
 * Strip tucked under the prompt input: on the left the logos of the tools the
 * agent can use (built-in tools + agent connectors) — a link to the AI Studio
 * Connectors page — and the Agent mode toggle on the right.
 * The logos rotate one step per second (1 2 3 4 5 → 2 3 4 5 6 → … → 7 1 2 3 4),
 * next to the name of the first one. After ROTATION_STEPS steps the rotation
 * stops and the button settles on a sky-blue Box icon + "Connectors", with one blink.
 */
export function AgentToolsTray({
  agentMode,
  onAgentModeChange,
  onWorkerChange,
  className,
}: AgentToolsTrayProps) {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const { data } = useToolsControllerGetManyTools(
    { agentTool: true, limit: AGENT_TOOLS_LIMIT },
    { query: { enabled: Boolean(selectedWorkspaceId) } },
  );
  const tools = data?.data ?? [];
  const reduceMotion = useReducedMotion();

  // Ever-increasing step: it keys the logos, so each step one logo leaves at
  // the front and one enters at the back even when every tool already fits.
  // A single tool still counts the steps (to settle) but never re-keys.
  const [step, setStep] = useState(0);
  const settled = step >= ROTATION_STEPS;
  const rotating = tools.length > 1;
  useEffect(() => {
    if (tools.length === 0 || settled) return;
    const timer = setInterval(() => setStep((s) => s + 1), ROTATE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [tools.length, settled]);

  const offset = rotating ? step : 0;
  const visible = Array.from(
    { length: Math.min(VISIBLE_LOGOS, tools.length) },
    (_, i) => ({ key: offset + i, tool: tools[(offset + i) % tools.length] }),
  );
  const first = visible[0]?.tool;

  return (
    <div
      className={cn(
        'mx-4 flex items-center justify-between gap-2 rounded-b-2xl border border-t-0 bg-muted px-2 py-1 text-muted-foreground',
        className,
      )}
    >
      {first && (
        <Link
          to="/aistudio/connectors"
          aria-label="Agent tools"
          className="relative flex min-w-0 items-center overflow-hidden rounded-md p-1 pr-2 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
        >
          {/* popLayout: the outgoing view leaves the flow at once, so the
              button resizes straight to the incoming one */}
          <AnimatePresence initial={false} mode="popLayout">
            {settled ? (
              <motion.span
                key="connector"
                // One blink: flash in, dip, then settle.
                initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
                animate={
                  reduceMotion
                    ? { opacity: 1 }
                    : { opacity: [0, 1, 0.25, 1], scale: [0.9, 1.06, 1, 1] }
                }
                transition={{ duration: 0.7, times: [0, 0.3, 0.6, 1] }}
                className="flex items-center gap-1.5 px-1 text-sm"
              >
                <Box className="size-4 text-sky-500" />
                Connectors
              </motion.span>
            ) : (
              <motion.span
                key="tools"
                exit={reduceMotion ? undefined : { opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                className="flex min-w-0 items-center gap-2"
              >
                {/* -ml on every logo (offset by pl) keeps the overlap uniform
                    while logos enter and leave */}
                <span className="flex items-center pl-1.5">
                  <AnimatePresence initial={false} mode="popLayout">
                    {visible.map(({ key, tool }) => (
                      <motion.span
                        key={key}
                        layout={!reduceMotion}
                        initial={
                          reduceMotion ? false : { opacity: 0, scale: 0.6 }
                        }
                        animate={{ opacity: 1, scale: 1 }}
                        exit={
                          reduceMotion ? undefined : { opacity: 0, scale: 0.6 }
                        }
                        transition={{ duration: 0.3 }}
                        className="-ml-1.5 inline-flex"
                      >
                        {/* LogoFrame is white only in dark mode; give light
                            mode the same tile, outlined so overlapping logos
                            stay apart */}
                        <LogoFrame className="shrink-0 overflow-hidden bg-white ring-2 ring-border dark:ring-background">
                          {/* Empty title: no per-tool name tooltip on hover */}
                          <ToolLogo
                            name={tool.name}
                            logoUrl={tool.logoUrl}
                            size={16}
                            title=""
                          />
                        </LogoFrame>
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </span>
                <AnimatePresence initial={false} mode="wait">
                  <motion.span
                    key={offset}
                    initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="max-w-32 truncate text-sm"
                  >
                    {upperFirst(first.name)}
                  </motion.span>
                </AnimatePresence>
              </motion.span>
            )}
          </AnimatePresence>
          {settled && !reduceMotion && (
            // A light sweep across the button as the label lands.
            <motion.span
              aria-hidden="true"
              initial={{ x: '-100%' }}
              animate={{ x: '100%' }}
              transition={{ duration: 0.8, delay: 0.15, ease: 'easeInOut' }}
              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-foreground/15 to-transparent"
            />
          )}
        </Link>
      )}
      {/* ml-auto keeps the toggle on the right even with no tools to show */}
      <div className="ml-auto">
        <AgentModeToggle
          value={agentMode}
          onChange={onAgentModeChange}
          onWorkerChange={onWorkerChange}
        />
      </div>
    </div>
  );
}
