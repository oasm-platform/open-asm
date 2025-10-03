import { DataTable } from "@/components/ui/data-table";
import { useServerDataTable } from "@/hooks/useServerDataTable";
import { 
  useMcpControllerGetMcpPermissions, 
  type McpPermission 
} from "@/services/apis/gen/queries";
import { mcpPermissionColumns } from "./mcp-permission-columns";

/**
 * Component to display a list of MCP permissions in a data table
 * Fetches permissions data from the API and renders it using DataTable component
 */
const ListMcpPermissions = () => {
  const {
    tableParams: { page, pageSize, sortBy, sortOrder },
    tableHandlers: { setPage, setPageSize, setSortBy, setSortOrder },
  } = useServerDataTable();

  // Fetch MCP permissions data from the API
  const { data, isLoading } = useMcpControllerGetMcpPermissions(
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

  return (
    <div className="space-y-4">
      <DataTable<McpPermission, unknown>
        columns={mcpPermissionColumns}
        data={data?.data || []}
        isLoading={isLoading}
        page={page + 1}
        pageSize={pageSize}
        totalItems={data?.total || 0}
        onPageChange={(newPage) => setPage(newPage - 1)}
        onPageSizeChange={setPageSize}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(newSortBy, newSortOrder) => {
          setSortBy(newSortBy);
          setSortOrder(newSortOrder);
        }}
      />
    </div>
  );
};

export default ListMcpPermissions;