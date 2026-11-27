import { useT } from '@/lib/i18n-dictionary';
import { cn } from '@/lib/utils';
import type { AgentHttpRequestListItemDto } from '@/services/apis/gen/queries';
import { statusText } from './format';

/** DevTools' Status column: the code, or why there is none */
export function StatusCell({
  request,
  className,
}: {
  request: Pick<AgentHttpRequestListItemDto, 'outcome' | 'statusCode' | 'error'>;
  className?: string;
}) {
  const t = useT();
  const status = statusText(request);
  if (status.kind === 'code') {
    return (
      <span
        className={cn(
          'font-mono tabular-nums',
          status.code >= 400
            ? 'text-red-600 dark:text-red-400'
            : status.code >= 300
              ? 'text-amber-600 dark:text-amber-400'
              : undefined,
          className,
        )}
      >
        {status.code}
      </span>
    );
  }
  if (status.kind === 'tunnel') {
    return (
      <span
        className={cn('text-muted-foreground', className)}
        title={t('agents.network.status.tunnel')}
      >
        —<span className="sr-only">{t('agents.network.status.tunnel')}</span>
      </span>
    );
  }
  return (
    <span
      className={cn(
        'font-mono',
        status.kind === 'cancelled'
          ? 'text-muted-foreground'
          : 'text-red-600 dark:text-red-400',
        className,
      )}
      title={request.error ?? undefined}
    >
      {t(`agents.network.status.${status.kind}`)}
    </span>
  );
}
