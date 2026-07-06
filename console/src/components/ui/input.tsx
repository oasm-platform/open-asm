import * as React from 'react';

import { cn } from '@/lib/utils';

function Input({
  className,
  type,
  error,
  ...props
}: React.ComponentProps<'input'> & { error?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <input
        type={type}
        data-slot="input"
        className={cn(
          'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
          error &&
            'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/50',
          className,
        )}
        {...props}
      />
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

export { Input };
