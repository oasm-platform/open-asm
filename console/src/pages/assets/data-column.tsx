import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import {
  BriefcaseBusiness,
  EthernetPort,
  Globe,
  Layers,
  Lock,
  Network,
} from "lucide-react";
import AssetValue from "./components/asset-value";
import BadgeList from "./components/badge-list";
import HTTPXStatusCode from "./components/status-code";

export const assetColumns: ColumnDef<any, any>[] = [
  {
    accessorKey: "value",
    header: "Value",
    enableHiding: false,
    size: 500,
    cell: ({ row }) => {
      const data = row.original;
      const ports = data.metadata?.ports;
      const http_scraper = data.metadata?.http_scraper;
      const ipAddresses = data.dnsRecords?.["A"];
      return (
        <div className="flex flex-col gap-2 py-2 justify-center items-start max-w-[500px]">
          <div className="flex items-center gap-2 w-full">
            <AssetValue http_scraper={http_scraper} value={data.value} />
            <HTTPXStatusCode http_scraper={http_scraper} />
          </div>
          {http_scraper?.title && (
            <p className="truncate w-full text-sm" title={http_scraper?.title}>
              {http_scraper?.title}
            </p>
          )}
          {http_scraper?.error && (
            <p
              className="text-red-500 truncate w-full text-sm"
              title={http_scraper?.error}
            >
              {http_scraper?.error}
            </p>
          )}
          <div className="w-full">
            <BadgeList list={ipAddresses} Icon={Network} />
          </div>
          <div className="w-full">
            <BadgeList
              list={ports?.sort((a: number, b: number) => a - b)}
              Icon={EthernetPort}
            />
          </div>
        </div>
      );
    },
  },
  {
    header: "Technologies",
    size: 250,
    cell: ({ row }) => {
      const data = row.original;
      const technologies: string[] = data.metadata?.http_scraper?.tech ?? [];
      const maxTechDisplay = 6;
      const displayedTechs = technologies.slice(0, maxTechDisplay);
      const remainingCount = technologies.length - maxTechDisplay;

      return (
        <div className="flex flex-wrap gap-1 max-w-[250px] min-h-[60px]">
          <BadgeList list={displayedTechs} Icon={Layers} />
          {remainingCount > 0 && (
            <Badge variant="outline" className="text-xs">
              +{remainingCount}
            </Badge>
          )}
        </div>
      );
    },
  },
  {
    header: "Certificate",
    size: 200,
    cell: ({ row }) => {
      const data = row.original;
      const tls = data.metadata?.http_scraper?.tls;
      if (!tls) return <div className="min-h-[60px]" />;

      const daysLeft = Math.round(
        Math.abs(
          (new Date(tls.not_after).getTime() - new Date().getTime()) /
            (1000 * 60 * 60 * 24)
        )
      );
      const color = daysLeft < 30 ? "red" : daysLeft < 60 ? "yellow" : "green";

      return (
        <div className="flex flex-col gap-1 max-w-[200px] min-h-[60px]">
          <Badge
            variant="outline"
            className={cn(
              "h-6 text-xs",
              color === "red"
                ? "text-red-500 border-red-500"
                : color === "yellow"
                  ? "text-yellow-500 border-yellow-500"
                  : "text-green-500 border-green-500"
            )}
          >
            <Lock size={14} color={color} className="mr-1" />
            SSL {daysLeft}d
          </Badge>
          {tls?.issuer_org && (
            <BadgeList list={[tls.issuer_org]} Icon={Globe} />
          )}
          {tls?.subject_org && (
            <BadgeList list={[tls.subject_org]} Icon={BriefcaseBusiness} />
          )}
        </div>
      );
    },
  },
  {
    header: "Time",
    size: 120,
    cell: ({ row }) => {
      const data = row.original;
      const createdAt = data.createdAt;
      if (!createdAt) return <div className="min-h-[60px]" />;

      return (
        <div className="flex flex-col gap-1 max-w-[120px] min-h-[60px] justify-center">
          <span className="text-xs text-gray-600">
            {dayjs(createdAt).fromNow()}
          </span>
        </div>
      );
    },
  },
];
