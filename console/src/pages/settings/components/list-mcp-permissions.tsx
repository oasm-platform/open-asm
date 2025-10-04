import { useServerDataTable } from "@/hooks/useServerDataTable";
import {
  useMcpControllerGetMcpPermissions
} from "@/services/apis/gen/queries";
import { WorkspacePermissionDetails } from './mcp-permission-detail';

/**
 * Component to display a list of MCP permissions in a data table
 * Fetches permissions data from the API and renders it using DataTable component
 */
const ListMcpPermissions = () => {
  const {
    tableParams: { page, pageSize, sortBy, sortOrder },
  } = useServerDataTable();

  // Fetch MCP permissions data from the API
  const { data } = useMcpControllerGetMcpPermissions(
    {
      limit: pageSize,
      page,
      sortBy,
      sortOrder: sortOrder as 'ASC' | 'DESC',
    },
    {
      query: {
        queryKey: ["mcp-permissions", pageSize, page, sortBy, sortOrder],
      },
    }
  );

  if (data?.data.length === 0) {
    return (
      <div className="p-4 bg-card rounded-lg">
        <div className="text-center text-gray-500 dark:text-gray-400">
          No permissions found
        </div>
      </div>
    );
  }
  return (
    <div className="divide-y rounded-lg overflow-hidden border">
      {data?.data.map((permission, index) => (
        <div
          key={permission.id}
          className={`p-4 ${index === 0
              ? 'rounded-t-lg'
              : index === data.data.length - 1
                ? 'rounded-b-lg'
                : ''
            }`}
        >
          <WorkspacePermissionDetails permission={permission} />
        </div>
      ))}
    </div>
  );
};

export default ListMcpPermissions;