import { DataTable } from '@/components/ui/data-table';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import {
  useWorkspacesControllerGetWorkspaces,
  type Workspace,
} from '@/services/apis/gen/queries';
import { workspaceColumns } from './workspace-columns';

const ListWorkspaces = () => {
  const {
    tableParams: { page, pageSize, sortBy, sortOrder },
    tableHandlers: { setPage, setPageSize, setParams },
  } = useServerDataTable();

  const { data, isLoading } = useWorkspacesControllerGetWorkspaces(
    {
      limit: pageSize,
      page,
      sortBy,
      sortOrder: sortOrder as 'ASC' | 'DESC',
    },
    {
      query: {
        queryKey: ['workspaces', pageSize, page, sortBy, sortOrder],
      },
    },
  );

  return (
    <div className="space-y-4">
      <DataTable<Workspace, unknown>
        columns={workspaceColumns}
        data={data?.data || []}
        isLoading={isLoading}
        page={page + 1}
        pageSize={pageSize}
        totalItems={data?.total || 0}
        onPageChange={(newPage) => setPage(newPage - 1)}
        onPageSizeChange={setPageSize}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(col, order) => {
          setParams({ sortBy: col, sortOrder: order });
        }}
      />
    </div>
  );
};

export default ListWorkspaces;

