import { JobStatus } from '@/services/apis/gen/queries';
import {
  BadgeCheckIcon,
  ClockIcon,
  Loader2Icon,
  XCircleIcon,
} from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { Badge } from './badge';

interface StatusConfig {
  icon: React.ReactNode;
  className: string;
  label: string;
  variant: 'default' | 'outline';
}

const statusConfigs: Record<JobStatus, StatusConfig> = {
  [JobStatus.pending]: {
    icon: <ClockIcon className="h-4 w-4" />,
    className: 'text-yellow-500',
    label: 'Pending',
    variant: 'outline',
  },
  [JobStatus.in_progress]: {
    icon: <Loader2Icon className="animate-spin h-4 w-4" />,
    className: 'text-purple-500',
    label: 'In Progress',
    variant: 'outline',
  },
  [JobStatus.completed]: {
    icon: <BadgeCheckIcon className="h-4 w-4" />,
    className: 'text-green-500',
    label: 'Completed',
    variant: 'outline',
  },
  [JobStatus.failed]: {
    icon: <XCircleIcon className="h-4 w-4" />,
    className: 'text-red-500',
    label: 'Failed',
    variant: 'outline',
  },
  [JobStatus.cancelled]: {
    icon: <XCircleIcon className="h-4 w-4" />,
    className: 'text-gray-500',
    label: 'Cancelled',
    variant: 'outline',
  },
};

const defaultConfig: StatusConfig = {
  icon: null,
  className: 'text-gray-500 text-white',
  label: 'Unknown',
  variant: 'outline',
};

interface JobStatusProps {
  status: JobStatus;
  onlyIcon?: boolean;
}

const JobStatusBadge = ({ status, onlyIcon = false }: JobStatusProps) => {
  const config = statusConfigs[status] || defaultConfig;
  const navigate = useNavigate();
  return (
    <Badge
      variant={config.variant}
      className={config.className + ' h-8 cursor-pointer flex items-center'}
      onClick={() => {
        const showAnimation = status === JobStatus.pending || status === JobStatus.in_progress;
        navigate({
          search: ((prev: Record<string, unknown>) => ({
            ...prev,
            animation: showAnimation ? 'true' : undefined,
          })) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
          replace: true,
        });
      }}
    >
      <span className="flex items-center">
        {config.icon}
        {!onlyIcon && <span className="ml-1">{config.label}</span>}
      </span>
    </Badge>
  );
};

export default JobStatusBadge;
