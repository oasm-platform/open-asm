import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Workspace } from "@/services/apis/gen/queries";
import { type ColumnDef } from "@tanstack/react-table";
import { Edit } from "lucide-react";
import ArchivedWorkspace from "./archived-workspace";


export const workspaceColumns: ColumnDef<Workspace, unknown>[] = [
    {
        accessorKey: "name",
        header: "Workspace Name",
        cell: ({ row }) => (
            <div className="font-medium">{row.getValue("name")}</div>
        ),
    },
    {
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => (
            <div className="text-gray-500">{row.getValue("description") || "No description"}</div>
        ),
    },
    {
        accessorKey: "createdAt",
        header: "Created At",
        cell: ({ row }) => (
            <div className="text-gray-500">
                {new Date(row.getValue("createdAt")).toLocaleDateString()}
            </div>
        ),
    },
    {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
            const workspace = row.original as Workspace;
            return (
                <Badge className={workspace.archivedAt ? "bg-gray-500 text-white" : "bg-green-500 text-white"}>
                    {workspace.archivedAt ? "Archived" : "Active"}
                </Badge>
            );
        }
    },
    {
        accessorKey: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => {
            const workspace = row.original as Workspace;
            return (
                <div className="flex justify-start gap-2">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-muted-foreground hover:text-muted-foreground/80"

                                >
                                    <Edit className="h-4 w-4" />
                                    <span className="sr-only">Edit</span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Edit workspace</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    <ArchivedWorkspace workspace={workspace} />
                </div>
            );
        }
    },
];
