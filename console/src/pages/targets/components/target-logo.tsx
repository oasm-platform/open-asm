import { cn } from '@/lib/utils';
import { Globe } from 'lucide-react';
import { useState } from 'react';

interface TargetLogoProps {
  /** `logo` from the targets API: org avatar or favicon, null when none. */
  url: string | null | undefined;
  className?: string;
}

/** Target logo; the default globe when there is none or it fails to load. */
export function TargetLogo({ url, className }: TargetLogoProps) {
  // Keyed by url so a new logo gets a fresh load attempt.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!url || failedUrl === url) {
    return (
      <Globe
        className={cn('size-5 shrink-0 text-muted-foreground', className)}
      />
    );
  }

  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      className={cn('size-5 shrink-0 rounded-full object-cover', className)}
      onError={() => setFailedUrl(url)}
    />
  );
}
