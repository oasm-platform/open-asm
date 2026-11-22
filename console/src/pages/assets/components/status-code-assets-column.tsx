import StatusCode from '@/components/ui/status-code';
import { type GetStatusCodeAssetsDTO } from '@/services/apis/gen/queries';
import { t } from '@/lib/i18n-dictionary';
import type { ColumnDef } from '@tanstack/react-table';

export const statusCodeAssetsColumn: ColumnDef<GetStatusCodeAssetsDTO>[] = [
  {
    accessorKey: 'statusCode',
    header: () => t('assets.columns.statusCode'),
    enableHiding: false,
    size: 500,
    cell: ({ row }) => {
      const data = row.original;
      return (
        <div className="flex flex-col gap-2 py-2 justify-center items-start max-w-[500px]">
          <StatusCode code={data.statusCode} />
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
