import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type {
  GetAssetsResponseDto,
  TechnologyDetailDTO,
} from '@/services/apis/gen/queries';
import type { ColumnDef } from '@tanstack/react-table';
import dayjs from 'dayjs';
import {
  BriefcaseBusiness,
  EthernetPort,
  Globe,
  Lock,
  Network,
  Tag,
} from 'lucide-react';
import AssetValue from './asset-value';
import BadgeList from './badge-list';
import HTTPXStatusCode from './status-code';
import { TechnologyTooltip } from './technology-tooltip';

export const assetColumns: ColumnDef<GetAssetsResponseDto>[] = [
  {
    accessorKey: 'value',
    header: 'Value',
    enableHiding: false,
    size: 500,
    cell: ({ row }) => {
      const data = row.original;
      const ports = data.ports?.ports as string[];
      const httpResponse = data.httpResponses;
      const ipAddresses = data.ipAddresses;
      const tags = data.tags;

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
            <BadgeList
              list={ipAddresses?.sort((a: string, b: string) => {
                const isIPv4 = (ip: string) =>
                  /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
                if (isIPv4(a) && !isIPv4(b)) return -1;
                if (!isIPv4(a) && isIPv4(b)) return 1;
                return 0;
              })}
              Icon={Network}
              maxDisplay={2}
            />
          </div>
          <div className="w-full">
            <BadgeList
              list={tags.map((t) => t.tag)}
              Icon={Tag}
              maxDisplay={2}
            />
          </div>
          {ports && (
            <div className="w-full">
              <BadgeList
                list={ports.sort(
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
      const technologies = data.httpResponses
        ?.techList as unknown as TechnologyDetailDTO[];
      const maxDisplay = 4;
      const displayList = technologies?.slice(0, maxDisplay);
      const remainCount = technologies?.length - maxDisplay;

      return (
        <div className="flex flex-wrap gap-1 max-w-[250px] min-h-[60px]">
          {displayList?.map((item) => (
            <TechnologyTooltip tech={item} key={item.name} />
          ))}
          {remainCount > 0 && (
            <Badge variant="outline" className="text-xs">
              +{remainCount}
            </Badge>
          )}
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
              maxDisplay={2}
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
