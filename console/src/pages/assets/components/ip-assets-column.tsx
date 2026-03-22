import type { GetIpAssetsDTO } from '@/services/apis/gen/queries';
import type { ColumnDef } from '@tanstack/react-table';
import { Network } from 'lucide-react';
import BadgeList from './badge-list';
import IpLocationMap from './ip-location-map';

export const ipAssetsColumn: ColumnDef<GetIpAssetsDTO>[] = [
  {
    accessorKey: 'ip',
    header: 'IP',
    enableHiding: false,
    enableSorting: true,
    size: 300,
    cell: ({ row }) => {
      const data = row.original;
      return (
        <div className="flex flex-col gap-2 py-2 justify-center items-start max-w-[300px]">
          <BadgeList list={[data.ip]} Icon={Network} />
        </div>
      );
    },
  },
  {
    id: 'location',
    header: 'Location',
    enableSorting: false,
    size: 220,
    cell: ({ row }) => {
      return <IpLocationMap geoIp={row.original.geoIp} />;
    },
  },
  {
    id: 'country',
    header: 'Country',
    enableSorting: false,
    size: 180,
    cell: ({ row }) => {
      const geoIp = row.original.geoIp;
      if (!geoIp) return '-';

      return (
        <div className="flex flex-col gap-0.5">
          <span>{geoIp.country ?? '-'}</span>
          {geoIp.countryCode && (
            <span className="text-xs text-muted-foreground">
              {geoIp.countryCode}
            </span>
          )}
        </div>
      );
    },
  },
  {
    id: 'as',
    header: 'ASN',
    enableSorting: false,
    size: 300,
    cell: ({ row }) => {
      const geoIp = row.original.geoIp;
      if (!geoIp) return '-';

      return (
        <div className="flex flex-col gap-0.5">
          <span>{geoIp.asname ?? '-'}</span>
          {geoIp.as && (
            <span className="text-xs text-muted-foreground">{geoIp.as}</span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'assetCount',
    header: 'Number of services',
    enableSorting: true,
    size: 200,
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
