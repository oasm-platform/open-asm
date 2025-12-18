import { CheckCircleIcon, CircleIcon } from 'lucide-react';

interface StatusBadgeProps {
  status: string;
  variant?: 'default' | 'outline';
  className?: string;
}

export const StatusBadge = ({ status }: StatusBadgeProps) => {
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
    <div
      className={`${statusColor} flex h-8 items-center gap-1 capitalize font-bold border p-1.5 rounded-md`}
    >
      <StatusIcon size={20} />
      {status}
    </div>
  );
};

export default StatusBadge;
