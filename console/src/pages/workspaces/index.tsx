import Page from '@/components/common/page';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import {
  useWorkspacesControllerGetWorkspaces,
  type Workspace,
} from '@/services/apis/gen/queries';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { workspaceColumns } from '../settings/components/workspace-columns';

export default function Workspaces() {
  const navigate = useNavigate();

  const {
    tableParams: { page, pageSize, sortBy, sortOrder },
    tableHandlers: { setPage, setPageSize, setSortBy, setSortOrder },
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
    <Page
      title="Workspaces"
      action={
        <Button size="sm" onClick={() => navigate('/workspaces/create')}>
          <Plus size={16} className="mr-2" />
          Create workspace
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Manage your workspaces and permissions
        </p>
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
          onSortChange={(newSortBy, newSortOrder) => {
            setSortBy(newSortBy);
            setSortOrder(newSortOrder);
          }}
        />
      </div>
    </Page>
  );
}
