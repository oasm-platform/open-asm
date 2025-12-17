import { Badge } from '@/components/ui/badge';
import { CheckCircleIcon, CircleIcon } from 'lucide-react';

interface StatusBadgeProps {
  status: string;
  variant?: 'default' | 'outline';
  className?: string;
}

export const StatusBadge = ({
  status,
  variant = 'outline',
  className,
}: StatusBadgeProps) => {
  let statusColor = 'text-gray-500';
  let StatusIcon = CircleIcon;

  if (status?.toLowerCase() === 'open') {
    statusColor = 'text-green-500';
    StatusIcon = CircleIcon;
  } else if (status?.toLowerCase() === 'closed') {
    statusColor = 'text-purple-500';
    StatusIcon = CheckCircleIcon;
  }

  return (
    <Badge
      variant={variant}
      className={`${statusColor} h-8 flex items-center gap-1 capitalize ${className || ''}`}
    >
      <StatusIcon className="h-4 w-4" />
      {status}
    </Badge>
  );
};

export default StatusBadge;
