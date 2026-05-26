import type { RemoteExecuteStreamEvent } from '@/hooks/use-remote-execute-stream';
import { motion } from 'framer-motion';
import { RemoteExecuteTerminal } from './remote-execute-terminal';

export interface ToolCallState {
  toolCallId: string;
  toolName: string;
  status: 'pending' | 'executing' | 'completed' | 'error';
  input?: Record<string, unknown>;
  output?: unknown;
}

function formatToolName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ToolCallDisplay({
  toolCall,
  streamEvents,
}: {
  toolCall: ToolCallState;
  streamEvents?: RemoteExecuteStreamEvent[];
}) {
  const formattedName = formatToolName(toolCall.toolName);

  if (toolCall.toolName === 'execute_remote_command') {
    return <RemoteExecuteTerminal toolCall={toolCall} streamEvents={streamEvents} />;
  }

  const containerVariants = {
    hidden: {},
    visible: {
      backgroundPosition: ['200% 0', '-200% 0'],
      transition: {
        staggerChildren: 0.04,
        backgroundPosition: {
          repeat: Infinity,
          duration: 2,
          ease: 'linear',
        },
      },
    },
    exit: {
      transition: {
        staggerChildren: 0.02,
        staggerDirection: -1,
      },
    },
  };

  const letterVariants = {
    hidden: { opacity: 0, display: 'none' },
    visible: { opacity: 1, display: 'inline-block' },
    exit: { opacity: 0, transition: { duration: 0.08 } },
  };

  return (
    <div className="flex items-center gap-1.5 text-muted-foreground italic select-none">
      <motion.span
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="bg-linear-to-r from-gray-400 via-white to-gray-400 bg-clip-text text-transparent bg-[length:200%_100%]"
      >
        {formattedName.split('').map((char, index) => (
          <motion.span key={index} variants={letterVariants} exit="exit">
            {char === ' ' ? '\u00A0' : char}
          </motion.span>
        ))}
      </motion.span>
      <motion.span
        animate={
          toolCall.status === 'executing'
            ? { opacity: [0.3, 1, 0.3] }
            : { opacity: 1 }
        }
        transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
      >
        …
      </motion.span>
    </div>
  );
}
