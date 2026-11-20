import { Badge } from '@/components/ui/badge';
import { useT, t } from '@/lib/i18n-dictionary';
import { createColumnHelper } from '@tanstack/react-table';
import { type GetTlsResponseDto } from '@/services/apis/gen/queries';
import dayjs from 'dayjs';
import { Clock } from 'lucide-react';

const columnHelper = createColumnHelper<GetTlsResponseDto>();

function ExpiryBadge({ notAfter }: { notAfter?: string }) {
  const t = useT();
  if (!notAfter) return <span className="text-muted-foreground">–</span>;

  const expiry = dayjs(notAfter);
  const now = dayjs();
  const daysLeft = expiry.diff(now, 'day');

  let variant: 'default' | 'secondary' | 'destructive' | 'outline' =
    'secondary';
  if (daysLeft <= 7) variant = 'destructive';
  else if (daysLeft <= 30) variant = 'outline';

  return (
    <div className="flex items-center gap-1.5">
      <Clock className="size-4 text-muted-foreground" />
      <Badge variant={variant} className="font-mono whitespace-nowrap">
        {expiry.format('YYYY-MM-DD')}
      </Badge>
      {daysLeft >= 0 && (
        <span className="text-muted-foreground">({t('assets.tls.daysShort', { days: daysLeft })})</span>
      )}
    </div>
  );
}

export const tlsAssetsColumn = [
  columnHelper.accessor('host', {
    header: () => t('assets.columns.host'),
    cell: (info) => <span className="font-mono">{info.getValue() ?? '–'}</span>,
    enableSorting: true,
  }),
  columnHelper.accessor('sni', {
    header: () => t('assets.columns.sni'),
    cell: (info) => (
      <span className="text-muted-foreground">{info.getValue() ?? '–'}</span>
    ),
    enableSorting: false,
  }),
  columnHelper.accessor('subject_dn', {
    header: () => t('assets.columns.subjectDn'),
    cell: (info) => (
      <span
        className="truncate max-w-[260px] block text-muted-foreground"
        title={info.getValue()}
      >
        {info.getValue() ?? '–'}
      </span>
    ),
    enableSorting: true,
  }),
  columnHelper.accessor('tls_version', {
    header: () => t('assets.columns.tlsVersion'),
    cell: (info) => (
      <Badge variant="secondary" className="font-mono">
        {info.getValue() ?? '–'}
      </Badge>
    ),
    enableSorting: false,
  }),
  columnHelper.accessor('not_before', {
    header: () => t('assets.columns.validFrom'),
    cell: (info) => (
      <span className="font-mono text-muted-foreground">
        {info.getValue() ? dayjs(info.getValue()).format('YYYY-MM-DD') : '–'}
      </span>
    ),
    enableSorting: true,
  }),
  columnHelper.accessor('not_after', {
    header: () => t('assets.columns.expires'),
    cell: (info) => <ExpiryBadge notAfter={info.getValue()} />,
    enableSorting: true,
  }),
];
