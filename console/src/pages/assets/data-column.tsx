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
    cell: ({ row }) => {
      const data = row.original;
      const ports = data.metadata?.ports;
      const http_scraper = data.metadata?.http_scraper;
      const ipAddresses = data.dnsRecords?.["A"];
      return (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <AssetValue http_scraper={http_scraper} value={data.value} />
            <HTTPXStatusCode http_scraper={http_scraper} />
          </div>
          {http_scraper?.title && <p>{http_scraper?.title}</p>}
          {http_scraper?.error && <p className="text-red-500">{http_scraper?.error}</p>}
          <BadgeList list={ipAddresses} Icon={Network} />
          <BadgeList
            list={ports?.sort((a: number, b: number) => a - b)}
            Icon={EthernetPort}
          />
        </div>
      );
    },
  },
  {
    header: "Technologies",
    size: 25,
    minSize: 10,
    maxSize: 30,
    cell: ({ row }) => {
      const data = row.original;
      const technologies: string[] = data.metadata?.http_scraper?.tech ?? [];
      const maxTechDisplay = 10;
      const displayedTechs = technologies.slice(0, maxTechDisplay);
      const remainingCount = technologies.length - maxTechDisplay;

      return (
        <div className="flex flex-wrap gap-2 max-w-xs">
          <BadgeList list={displayedTechs} Icon={Layers} />
          {remainingCount > 0 && (
            <Badge variant="outline">+{remainingCount}</Badge>
          )}
        </div>
      );
    },
  },
  {
    header: "Certificate",
    size: 25,
    minSize: 10,
    maxSize: 30,
    cell: ({ row }) => {
      const data = row.original;
      const tls = data.metadata?.http_scraper?.tls;
      if (!tls) return null;
      const daysLeft = Math.round(
        Math.abs(
          (new Date(tls.not_after).getTime() - new Date().getTime()) /
          (1000 * 60 * 60 * 24),
        ),
      );
      const color = daysLeft < 30 ? "red" : daysLeft < 60 ? "yellow" : "green";
      return (
        <div className="flex flex-col flex-wrap gap-2 max-w-xs overflow-x-auto">
          <Badge
            variant="outline"
            className={cn(
              "h-7",
              color === "red"
                ? "text-red-500 border-red-500"
                : color === "yellow"
                  ? "text-yellow-500 border-yellow-500"
                  : "text-green-500 border-green-500",
            )}
          >
            <Lock size={20} color={color} /> SSL {daysLeft} days left
          </Badge>
          <BadgeList list={tls?.issuer_org} Icon={Globe} />
          <BadgeList list={tls?.subject_org} Icon={BriefcaseBusiness} />
        </div>
      );
    },
  },
  {
    header: "Time",
    size: 25,
    minSize: 10,
    maxSize: 30,
    cell: ({ row }) => {
      const data = row.original;
      const createdAt = data.createdAt;
      if (!createdAt) return null;
      return (
        <div className="flex flex-col flex-wrap gap-2 max-w-xs overflow-x-auto">
          <div className="flex items-center gap-1">
            <span className="text-xs">{dayjs(createdAt).fromNow()}</span>
          </div>
        </div>
      );
    },
  },
];
