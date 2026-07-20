import { motion } from 'framer-motion';
import { AlertCircle, RefreshCcwIcon, X } from 'lucide-react';

// ---------------------------------------------------------------------------
// StreamError
// ---------------------------------------------------------------------------

export function StreamError({
  error,
  onRetry,
  onDismiss,
  isRetrying,
  retryAttempt,
}: {
  error: string;
  onRetry?: () => void;
  onDismiss: () => void;
  isRetrying?: boolean;
  retryAttempt?: number;
}) {
  if (isRetrying) {
    return (
      <motion.div
        className="mx-auto max-w-3xl w-full px-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
          <RefreshCcwIcon className="size-5 text-amber-500 shrink-0 animate-spin" />
          <div className="flex-1">
            <p className="font-medium text-amber-600 dark:text-amber-500">
              Retrying… (attempt {retryAttempt ?? 1} of 3)
            </p>
            <p className="text-muted-foreground mt-1">
              A transient error occurred. Reconnecting automatically.
            </p>
          </div>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-md p-1 hover:bg-accent transition-colors"
              aria-label="Cancel retry"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="mx-auto max-w-3xl w-full px-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
        <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-medium text-destructive">Streaming error</p>
          <p className="text-muted-foreground mt-1">{error}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="flex items-center gap-1.5 rounded-md bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
            >
              <RefreshCcwIcon className="size-3.5" />
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md p-1 hover:bg-accent transition-colors"
            aria-label="Dismiss error"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
