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
      className={`${statusColor} flex h-8 items-center gap-1 capitalize font-bold`}
    >
      <StatusIcon size={24} className="h-10" />
      {status}
    </Badge>
  );
};

export default StatusBadge;
