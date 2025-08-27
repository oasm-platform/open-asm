import { type GetTechnologyAssetsDTO } from '@/services/apis/gen/queries';
import type { ColumnDef } from '@tanstack/react-table';

export const technologyAssetsColumn: ColumnDef<GetTechnologyAssetsDTO>[] = [
  {
    accessorKey: 'technology',
    header: 'Technology',
    enableHiding: false,
    size: 500,
    enableSorting: false,
    cell: ({ row }) => {
      const data = row.original;
      return (
        <div className="flex flex-col gap-2 py-2 justify-center items-start max-w-[500px]">
          {data.technology}
        </div>
      );
    },
  },
  {
    accessorKey: 'assetCount',
    header: 'Number of assets',
    enableSorting: true,
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
