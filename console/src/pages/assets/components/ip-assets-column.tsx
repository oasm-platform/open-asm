import type { GetIpAssetsDTO } from '@/services/apis/gen/queries';
import { t } from '@/lib/i18n-dictionary';
import type { ColumnDef } from '@tanstack/react-table';
import { Network } from 'lucide-react';
import BadgeList from './badge-list';
import IpLocationMap from './ip-location-map';

export const ipAssetsColumn: ColumnDef<GetIpAssetsDTO>[] = [
  {
    accessorKey: 'ip',
    header: () => t('assets.columns.ip'),
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
    header: () => t('assets.columns.location'),
    enableSorting: false,
    size: 220,
    cell: ({ row }) => {
      return <IpLocationMap geoIp={row.original.geoIp} />;
    },
  },
  {
    id: 'country',
    header: () => t('assets.columns.country'),
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
    header: () => t('assets.columns.asn'),
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
    header: () => t('assets.columns.numberOfServices'),
    enableSorting: true,
    size: 200,
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
