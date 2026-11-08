import { Badge } from './badge';

interface SeverityBadgeProps {
  severity: string;
  /**
   * `outline` (default): coloured pill with background and border.
   * `text`: the coloured word alone, for dense feeds; it takes the font
   * size of the surrounding text.
   */
  variant?: 'outline' | 'text';
}

interface SeverityColor {
  color: string;
  text: string;
  border?: string;
}

const severityColors: Record<string, SeverityColor> = {
  critical: {
    color: 'bg-red-100',
    text: 'text-red-500',
    border: 'border border-red-500',
  },
  high: {
    color: 'bg-orange-100',
    text: 'text-orange-500',
    border: 'border border-orange-500',
  },
  medium: {
    color: 'bg-yellow-100',
    text: 'text-yellow-500',
    border: 'border border-yellow-500',
  },
  low: {
    color: 'bg-blue-100',
    text: 'text-blue-500',
    border: 'border border-blue-500',
  },
  info: {
    color: 'bg-gray-100',
    text: 'text-gray-500',
    border: 'border border-gray-500',
  },
};

export function SeverityBadge({
  severity,
  variant = 'outline',
}: SeverityBadgeProps) {
  const normalizedSeverity = severity.toLowerCase();
  const {
    color,
    text,
    border = '',
  } = severityColors[normalizedSeverity] || severityColors['info'];
  const label = severity.charAt(0).toUpperCase() + severity.slice(1);

  if (variant === 'text') {
    return <span className={`${text} font-medium`}>{label}</span>;
  }

  return (
    <Badge
      className={`${color} ${text} ${border} px-2 h-7 py-0.5 rounded-full text-xs font-medium`}
    >
      {label}
    </Badge>
  );
}

export default SeverityBadge;
