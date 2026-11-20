import { type GetHostAssetsDTO } from '@/services/apis/gen/queries';
import { t } from '@/lib/i18n-dictionary';
import type { ColumnDef } from '@tanstack/react-table';
import { CloudCheck } from 'lucide-react';
import BadgeList from './badge-list';
import { NewBadge } from './new-badge';
import SwitchEnableAsset from './switch-enable-asset';

export const hostAssetsColumn: ColumnDef<GetHostAssetsDTO>[] = [
  {
    accessorKey: 'host',
    header: () => t('assets.columns.host'),
    enableHiding: false,
    size: 500,
    cell: ({ row }) => {
      const data = row.original;
      return (
        <div className="flex items-center gap-2 py-2 max-w-[500px]">
          <BadgeList list={[data.host]} Icon={CloudCheck} />
          <NewBadge isNew={data.isNew} />
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
  {
    accessorKey: 'isEnabled',
    header: () => t('assets.columns.enabled'),
    size: 120,
    cell: ({ row }) => {
      const data = row.original;
      return (
        <SwitchEnableAsset
          id={data.id}
          currentStatus={data.isEnabled}
        />
      );
    },
  },
];
