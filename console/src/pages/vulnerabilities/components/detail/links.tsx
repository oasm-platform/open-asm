import { useT } from '@/lib/i18n-dictionary';
import { cn } from '@/lib/utils';
import { Link } from '@tanstack/react-router';
import { MessageSquare, PlayCircle } from 'lucide-react';

/** Link to the scan run (job history) page. */
export function RunLink({
  id,
  className,
}: {
  id?: string | null;
  className?: string;
}) {
  const t = useT();
  if (!id) return null;
  return (
    <Link
      to="/jobs/runs/$id"
      params={{ id }}
      className={cn(
        'inline-flex items-center gap-1 text-primary hover:underline',
        className,
      )}
      title={t('vulnerabilities.links.runTitle', { id })}
    >
      <PlayCircle className="size-3" />
      {t('vulnerabilities.links.run', { id: id.slice(0, 8) })}
    </Link>
  );
}

/** Link to an agent conversation in AI Studio. */
export function ConversationLink({
  id,
  label,
  className,
}: {
  id?: string | null;
  label?: string;
  className?: string;
}) {
  const t = useT();
  if (!id) return null;
  return (
    <Link
      to="/aistudio/conversations/$conversationId"
      params={{ conversationId: id }}
      className={cn(
        'inline-flex items-center gap-1 text-primary hover:underline',
        className,
      )}
    >
      <MessageSquare className="size-3" />
      {label ?? t('vulnerabilities.links.conversation')}
    </Link>
  );
}
