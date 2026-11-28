import { Badge } from '@/components/ui/badge';
import { useT } from '@/lib/i18n-dictionary';
import { cn } from '@/lib/utils';
import type { AgentHttpRequestListItemDto } from '@/services/apis/gen/queries';
import { statusText } from './format';
import { CHIP, TONES, type Tone } from './tones';

function codeTone(code: number): Tone {
  if (code >= 500) return 'red';
  if (code >= 400) return 'orange';
  if (code >= 300) return 'blue';
  if (code >= 200) return 'green';
  return 'muted';
}

/** DevTools' Status column as a coloured chip: the code, or why there is none */
export function StatusCell({
  request,
  className,
}: {
  request: Pick<AgentHttpRequestListItemDto, 'outcome' | 'statusCode' | 'error'>;
  className?: string;
}) {
  const t = useT();
  const status = statusText(request);
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
  const code = status.kind === 'code';
  const tone: Tone = code
    ? codeTone(status.code)
    : status.kind === 'cancelled'
      ? 'muted'
      : 'red';
  return (
    <Badge
      variant="outline"
      className={cn(CHIP, 'max-w-full tabular-nums', TONES[tone], className)}
      title={code ? undefined : (request.error ?? undefined)}
    >
      <span className="truncate">
        {code ? status.code : t(`agents.network.status.${status.kind}`)}
      </span>
    </Badge>
  );
}
