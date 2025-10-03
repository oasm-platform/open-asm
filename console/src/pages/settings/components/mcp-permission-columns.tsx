import { type McpPermission } from "@/services/apis/gen/queries";
import { type ColumnDef } from "@tanstack/react-table";
import ConnectButton from "./connect-button";
import { DeleteMcpPermission } from "./delete-mcp-permission";

export const mcpPermissionColumns: ColumnDef<McpPermission, unknown>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <div className="font-medium">{row.getValue("name") || "Unnamed"}</div>
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
        {new Date(row.original.createdAt).toLocaleDateString()}
      </div>
    ),
  },
  {
    id: "connect",
    header: "",
    cell: ({ row }) => (
      <ConnectButton id={row.original.id} />
    ),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <DeleteMcpPermission id={row.original.id} />
    ),
  },
];