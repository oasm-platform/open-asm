import { useT } from '@/lib/i18n-dictionary';
import { CheckCircleIcon, CircleIcon } from 'lucide-react';

interface StatusBadgeProps {
  status: string;
  variant?: 'default' | 'outline';
  className?: string;
}

export const StatusBadge = ({ status }: StatusBadgeProps) => {
  const t = useT();
  const normalized = status?.toLowerCase();
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
      className={`${statusColor} flex items-center gap-1 capitalize font-bold border p-1 rounded-md`}
    >
      <StatusIcon size={14} />
      {normalized === 'open' || normalized === 'closed'
        ? t(`components.status.${normalized}`)
        : status}
    </div>
  );
};

export default StatusBadge;
