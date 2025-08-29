import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { GetAssetsResponseDto } from '@/services/apis/gen/queries';
import type { ColumnDef } from '@tanstack/react-table';
import dayjs from 'dayjs';
import {
  BriefcaseBusiness,
  EthernetPort,
  Globe,
  Layers,
  Lock,
  Network,
} from 'lucide-react';
import AssetValue from './asset-value';
import BadgeList from './badge-list';
import HTTPXStatusCode from './status-code';

export const assetColumns: ColumnDef<GetAssetsResponseDto>[] = [
  {
    accessorKey: 'value',
    header: 'Value',
    enableHiding: false,
    size: 500,
    cell: ({ row }) => {
      const data = row.original;
      const ports_scanner = data.ports?.ports as string[];
      const httpResponse = data.httpResponses;
      const ipA = data.dnsRecords?.['A'] as string[];
      const ipAAAA = data.dnsRecords?.['AAAA'] as string[];
      const ipAddresses = ipAAAA ? ipA.concat(ipAAAA) : ipA;

      return (
        <div className="flex flex-col gap-2 py-2 justify-center items-start max-w-[500px]">
          <div className="flex items-center gap-2 w-full">
            <AssetValue httpResponse={httpResponse} value={data.value} />
            <HTTPXStatusCode httpResponse={httpResponse} />
          </div>
          {httpResponse?.title && (
            <p className="truncate w-full text-sm" title={httpResponse?.title}>
              {httpResponse?.title}
            </p>
          )}
          <div className="w-full">
            <BadgeList list={ipAddresses} Icon={Network} maxDisplay={4} />
          </div>
          {ports_scanner && (
            <div className="w-full">
              <BadgeList
                list={ports_scanner.sort(
                  (a: string, b: string) => parseInt(a) - parseInt(b),
                )}
                Icon={EthernetPort}
                maxDisplay={6}
              />
            </div>
          )}
        </div>
      );
    },
  },
  {
    header: 'Technologies',
    size: 250,
    cell: ({ row }) => {
      const data = row.original;
      const technologies: string[] = data.httpResponses?.tech ?? [];

      return (
        <div className="flex flex-wrap gap-1 max-w-[250px] min-h-[60px]">
          <BadgeList list={technologies} Icon={Layers} maxDisplay={6} />
        </div>
      );
    },
  },
  {
    header: 'Certificate',
    size: 200,
    cell: ({ row }) => {
      const data = row.original;
      const tls = data.httpResponses?.tls;
      if (!tls) return <div className="min-h-[60px]" />;

      const daysLeft = Math.round(
        Math.abs(
          (new Date(tls.not_after as unknown as Date).getTime() -
            new Date().getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      );
      const color = daysLeft < 30 ? 'red' : daysLeft < 60 ? 'yellow' : 'green';

      return (
        <div className="flex flex-col gap-1 max-w-[200px] min-h-[60px]">
          <Badge
            variant="outline"
            className={cn(
              'h-6 text-xs',
              color === 'red'
                ? 'text-red-500 border-red-500'
                : color === 'yellow'
                  ? 'text-yellow-500 border-yellow-500'
                  : 'text-green-500 border-green-500',
            )}
          >
            <Lock size={14} color={color} className="mr-1" />
            SSL {daysLeft}d
          </Badge>
          {(tls?.issuer_org as string[]) && (
            <BadgeList list={tls.issuer_org as string[]} Icon={Globe} />
          )}
          {(tls?.subject_an as string[]) && (
            <BadgeList
              list={tls.subject_an as string[]}
              Icon={BriefcaseBusiness}
            />
          )}
        </div>
      );
    },
  },
  {
    header: 'Time',
    size: 120,
    cell: ({ row }) => {
      const data = row.original;
      const createdAt = data.createdAt;
      if (!createdAt) return <div className="min-h-[60px]" />;

      return (
        <div className="flex flex-col gap-1 max-w-[120px] min-h-[60px] justify-center">
          <span>{dayjs(createdAt).fromNow()}</span>
        </div>
      );
    },
  },
];
