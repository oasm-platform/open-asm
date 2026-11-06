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
  if (!id) return null;
  return (
    <Link
      to="/jobs/runs/$id"
      params={{ id }}
      className={cn(
        'inline-flex items-center gap-1 text-primary hover:underline',
        className,
      )}
      title={`Run ${id}`}
    >
      <PlayCircle className="size-3" />
      run {id.slice(0, 8)}
    </Link>
  );
}

/** Link to an agent conversation in AI Studio. */
export function ConversationLink({
  id,
  label = 'Conversation',
  className,
}: {
  id?: string | null;
  label?: string;
  className?: string;
}) {
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
      {label}
    </Link>
  );
}
