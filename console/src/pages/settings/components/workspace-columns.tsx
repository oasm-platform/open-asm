import { Badge } from "@/components/ui/badge";
import type { Workspace } from "@/services/apis/gen/queries";
import { type ColumnDef } from "@tanstack/react-table";
import ArchivedWorkspace from "./archived-workspace";
import { EditWorkspaceDialog } from "./edit-workspace-dialog";
import ShowNameWorkspace from "./show-name-workspace";


export const workspaceColumns: ColumnDef<Workspace, unknown>[] = [
    {
        accessorKey: "name",
        header: "Workspace Name",
        cell: ({ row }) => (
            <ShowNameWorkspace workspace={row.original as Workspace} />
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
                    <EditWorkspaceDialog workspace={workspace} />
                    <ArchivedWorkspace workspace={workspace} />
                </div>
            );
        }
    },
];
