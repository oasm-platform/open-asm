import { Badge } from "@/components/ui/badge";
import SeverityBadge from "@/components/ui/severity-badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Vulnerability } from "@/services/apis/gen/queries";
import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLink, Info } from "lucide-react";
import { Link } from "react-router-dom";

export const vulnerabilityColumns: ColumnDef<Vulnerability, unknown>[] = [
    {
        accessorKey: "severity",
        header: "Severity",
        size: 120,
        cell: ({ row }) => {
            const value = String(row.getValue("severity")).toLowerCase();
            return (
                <div className="min-h-[60px] flex items-center">
                    <SeverityBadge severity={value} />
                </div>
            );
        },
    },
    {
        accessorKey: "name",
        header: "Details",
        size: 300,
        enableHiding: false,
        cell: ({ row }) => {
            const data = row.original;
            const value: string = row.getValue("name");
            const cveId: string = row.original.cveId;
            return (
                <div className="flex flex-col gap-2 py-2 justify-center min-h-[60px]">
                    <div className="flex items-center gap-2">
                        <div className="font-medium">{value}</div>
                        {cveId && (
                            <Badge variant="outline" className="text-xs">
                                {cveId}
                            </Badge>
                        )}
                        {data.description && (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Info size={14} className="text-muted-foreground cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs text-sm">
                                        {data.description}
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}
                    </div>
                </div>
            );
        },
    },
    {
        accessorKey: "affectedUrl",
        header: "Affected URL",
        size: 200,
        cell: ({ row }) => {
            const value: string = row.getValue("affectedUrl");
            return (
                <div className="flex items-center min-h-[60px]">
                    {value ? (
                        <div className="flex items-center gap-1">
                            <a
                                href={value}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-500 flex-shrink-0 flex items-center gap-1"
                            >
                                <span className="truncate">{value}</span>
                                <ExternalLink size={14} />
                            </a>
                        </div>
                    ) : (
                        <div className="text-muted-foreground">Not matched</div>
                    )}
                </div>
            );
        },
    },
    {
        accessorKey: "cvssScore",
        header: "CVSS Score",
        size: 120,
        cell: ({ row }) => {
            const value: string = row.getValue("cvssScore");
            return (
                <div className="min-h-[60px] flex items-center">
                    {value ? (
                        <Badge variant="outline" className="font-medium">
                            {value}
                        </Badge>
                    ) : (
                        <div className="text-muted-foreground">Not matched</div>
                    )}
                </div>
            );
        },
    },
    {
        accessorKey: "tags",
        header: "Tags",
        size: 150,
        cell: ({ row }) => {
            const tags = row.getValue("tags");
            if (!tags || !Array.isArray(tags)) {
                return (
                    <div className="min-h-[60px] flex items-center">
                        <div className="text-muted-foreground">Not matched</div>
                    </div>
                );
            }

            const maxTagsDisplay = 3;
            const displayedTags = tags.slice(0, maxTagsDisplay);
            const remainingCount = tags.length - maxTagsDisplay;

            return (
                <div className="flex flex-wrap gap-1 max-w-[150px] min-h-[60px] items-center">
                    {displayedTags.map((tag: string, index: number) => (
                        <Badge variant="outline" key={index} className="text-xs">
                            {tag}
                        </Badge>
                    ))}
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
        accessorKey: "createdAt",
        header: "Created At",
        size: 120,
        cell: ({ row }) => {
            const value: string = row.getValue("createdAt");
            return (
                <div className="min-h-[60px] flex items-center">
                    {value ? (
                        <div>{new Date(value).toLocaleDateString()}</div>
                    ) : (
                        <div className="text-muted-foreground">Not matched</div>
                    )}
                </div>
            );
        },
    },
    {
        header: "Scanned by",
        size: 120,
        cell: ({ row }) => {
            const { tool } = row.original
            if (!tool) return <>-</>
            return (
                <Link to={`/tools/${tool.id}`}>
                    <Badge
                        variant="outline"
                        className="text-xs"
                    >
                        {tool?.name.charAt(0).toUpperCase() + tool?.name.slice(1)}
                    </Badge>
                </Link>
            );
        },
    },
];
