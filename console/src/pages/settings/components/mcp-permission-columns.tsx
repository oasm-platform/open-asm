import { Badge } from "@/components/ui/badge";
import type { McpPermission, McpPermissionValue } from "@/services/apis/gen/queries";
import { type ColumnDef } from "@tanstack/react-table";

const PermissionsList = ({ permissions }: { permissions: string[] }) => {
  return (
    <div className="flex flex-wrap gap-1">
      {permissions.map((permission, index) => (
        <Badge key={index} variant="secondary" className="text-xs">
          {permission}
        </Badge>
      ))}
    </div>
  );
};

const WorkspacePermissionList = ({ value }: { value: McpPermissionValue }) => {
  const permissionsData = Array.isArray(value) ? value : [value];

  return (
    <div className="space-y-2">
      {permissionsData.map((item, index) => (
        <div key={index} className="border rounded p-2">
          <div className="font-medium text-sm">Workspace ID: {item.workspaceId}</div>
          <div className="mt-1">
            <span className="text-xs font-semibold">Permissions:</span>
            <PermissionsList permissions={item.permissions || []} />
          </div>
        </div>
      ))}
    </div>
  );
};

export const mcpPermissionColumns: ColumnDef<McpPermission, unknown>[] = [
  {
    accessorKey: "name",
    header: "Permission Name",
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
    accessorKey: "value",
    header: "Workspaces & Permissions",
    cell: ({ row }) => (
      <WorkspacePermissionList value={row.original.value} />
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
];