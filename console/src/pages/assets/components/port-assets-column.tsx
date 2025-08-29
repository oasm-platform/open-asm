import { type GetPortAssetsDTO } from '@/services/apis/gen/queries';
import type { ColumnDef } from '@tanstack/react-table';
import { EthernetPort } from 'lucide-react';
import BadgeList from './badge-list';

export const portAssetsColumn: ColumnDef<GetPortAssetsDTO>[] = [
  {
    accessorKey: 'port',
    header: 'Port',
    enableHiding: false,
    size: 500,
    cell: ({ row }) => {
      const data = row.original;
      return (
        <div className="flex flex-col gap-2 py-2 justify-center items-start max-w-[500px]">
          <BadgeList list={[data.port]} Icon={EthernetPort} />
        </div>
      );
    },
  },
  {
    accessorKey: 'assetCount',
    header: 'Number of services',
    size: 250,
    cell: ({ row }) => {
      const data = row.original;

      return (
        <div className="flex flex-wrap gap-1 items-center">
          {data.assetCount} {data.assetCount > 1 ? 'services' : 'service'}
        </div>
      );
    },
  },
];
