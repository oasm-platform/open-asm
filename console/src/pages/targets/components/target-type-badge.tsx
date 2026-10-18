import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TargetType } from '@/services/apis/gen/queries';

/**
 * Label and colours per backend `TargetType`. Keyed by the generated enum, so
 * a type added on the backend fails the build here until it gets a badge.
 * Colours match the dots of `TargetTypeFilter`.
 */
const TARGET_TYPE_BADGES: Record<TargetType, { label: string; className: string }> = {
  [TargetType.DOMAIN]: {
    label: 'Domain',
    className: 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  },
  [TargetType.CIDR]: {
    label: 'CIDR',
    className: 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400',
  },
  [TargetType.IP]: {
    label: 'IP',
    className: 'border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400',
  },
  [TargetType.GIT_ORG]: {
    label: 'Git org',
    className: 'border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400',
  },
};

interface TargetTypeBadgeProps {
  type: TargetType;
  className?: string;
}

export function TargetTypeBadge({ type, className }: TargetTypeBadgeProps) {
  const badge = TARGET_TYPE_BADGES[type];
  return (
    <Badge
      variant="outline"
      className={cn('text-xs font-medium', badge?.className, className)}
    >
      {badge?.label ?? type}
    </Badge>
  );
}
