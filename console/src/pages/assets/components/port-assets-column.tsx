import { type GetPortAssetsDTO } from '@/services/apis/gen/queries';
import { t } from '@/lib/i18n-dictionary';
import type { ColumnDef } from '@tanstack/react-table';
import { EthernetPort } from 'lucide-react';
import BadgeList from './badge-list';
import { NewBadge } from './new-badge';

export const portAssetsColumn: ColumnDef<GetPortAssetsDTO>[] = [
  {
    accessorKey: 'port',
    header: () => t('assets.columns.port'),
    enableHiding: false,
    size: 500,
    cell: ({ row }) => {
      const data = row.original;
      return (
        <div className="flex items-center gap-2 py-2 max-w-[500px]">
          <BadgeList list={[data.port]} Icon={EthernetPort} />
          <NewBadge isNew={data.isNew} count={data.newCount} />
        </div>
      );
    },
  },
  {
    accessorKey: 'assetCount',
    header: () => t('assets.columns.numberOfServices'),
    size: 250,
    cell: ({ row }) => {
      const data = row.original;

      return (
        <div className="flex flex-wrap gap-1 items-center">
          {t('assets.columns.serviceCount', { count: data.assetCount })}
        </div>
      );
    },
  },
];
