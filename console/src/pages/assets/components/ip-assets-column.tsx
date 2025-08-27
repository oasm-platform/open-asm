import type { GetIpAssetsDTO } from '@/services/apis/gen/queries';
import type { ColumnDef } from '@tanstack/react-table';

export const ipAssetsColumn: ColumnDef<GetIpAssetsDTO>[] = [
  {
    accessorKey: 'ip',
    header: 'IP',
    enableHiding: false,
    size: 500,
    cell: ({ row }) => {
      const data = row.original;
      return (
        <div className="flex flex-col gap-2 py-2 justify-center items-start max-w-[500px]">
          {data.ip}
        </div>
      );
    },
  },
  {
    accessorKey: 'assetCount',
    header: 'Number of assets',
    size: 250,
    cell: ({ row }) => {
      const data = row.original;

      return (
        <div className="flex flex-wrap gap-1 items-center">
          {data.assetCount}
        </div>
      );
    },
  },
];
