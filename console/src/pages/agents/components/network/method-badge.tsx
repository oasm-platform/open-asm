import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { displayMethod } from './format';
import { CHIP, TONES, type Tone } from './tones';

const METHOD_TONES: Record<string, Tone> = {
  GET: 'green',
  HEAD: 'green',
  POST: 'amber',
  PUT: 'blue',
  PATCH: 'violet',
  DELETE: 'red',
  OPTIONS: 'pink',
};

/** An HTTP method as a coloured chip, Postman style; CONNECT and the rest muted */
export function MethodBadge({
  method,
  className,
}: {
  method: string | null;
  className?: string;
}) {
  const label = displayMethod(method);
  return (
    <Badge
      variant="outline"
      className={cn(CHIP, TONES[METHOD_TONES[label] ?? 'muted'], className)}
    >
      {label}
    </Badge>
  );
}
