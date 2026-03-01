import { Badge } from '@/components/ui/badge';
import { createColumnHelper } from '@tanstack/react-table';
import { type GetTlsResponseDto } from '@/services/apis/gen/queries';
import dayjs from 'dayjs';
import { Clock } from 'lucide-react';

const columnHelper = createColumnHelper<GetTlsResponseDto>();

function ExpiryBadge({ notAfter }: { notAfter?: string }) {
  if (!notAfter) return <span className="text-muted-foreground">–</span>;

  const expiry = dayjs(notAfter);
  const now = dayjs();
  const daysLeft = expiry.diff(now, 'day');

  let variant: 'default' | 'secondary' | 'destructive' | 'outline' =
    'secondary';
  if (daysLeft < 0) variant = 'destructive';
  else if (daysLeft <= 7) variant = 'destructive';
  else if (daysLeft <= 30) variant = 'outline';

  return (
    <div className="flex items-center gap-1.5">
      <Clock className="size-3 text-muted-foreground" />
      <Badge variant={variant} className="text-xs font-mono whitespace-nowrap">
        {expiry.format('YYYY-MM-DD')}
      </Badge>
      {daysLeft >= 0 && (
        <span className="text-xs text-muted-foreground">({daysLeft}d)</span>
      )}
    </div>
  );
}

export const tlsAssetsColumn = [
  columnHelper.accessor('host', {
    header: 'Host',
    cell: (info) => (
      <span className="font-mono text-xs">{info.getValue() ?? '–'}</span>
    ),
    enableSorting: true,
  }),
  columnHelper.accessor('sni', {
    header: 'SNI',
    cell: (info) => (
      <span className="text-xs text-muted-foreground">
        {info.getValue() ?? '–'}
      </span>
    ),
    enableSorting: false,
  }),
  columnHelper.accessor('subject_dn', {
    header: 'Subject DN',
    cell: (info) => (
      <span
        className="text-xs truncate max-w-[260px] block text-muted-foreground"
        title={info.getValue()}
      >
        {info.getValue() ?? '–'}
      </span>
    ),
    enableSorting: true,
  }),
  columnHelper.accessor('tls_version', {
    header: 'TLS Version',
    cell: (info) => (
      <Badge variant="secondary" className="text-xs font-mono">
        {info.getValue() ?? '–'}
      </Badge>
    ),
    enableSorting: false,
  }),
  columnHelper.accessor('not_before', {
    header: 'Valid From',
    cell: (info) => (
      <span className="text-xs font-mono text-muted-foreground">
        {info.getValue() ? dayjs(info.getValue()).format('YYYY-MM-DD') : '–'}
      </span>
    ),
    enableSorting: true,
  }),
  columnHelper.accessor('not_after', {
    header: 'Expires',
    cell: (info) => <ExpiryBadge notAfter={info.getValue()} />,
    enableSorting: true,
  }),
];
