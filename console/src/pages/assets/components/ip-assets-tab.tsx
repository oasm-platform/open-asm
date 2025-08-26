import { DataTable } from '@/components/ui/data-table';
import { TabsContent } from '@/components/ui/tabs';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { useAssetsControllerGetIpAssets } from '@/services/apis/gen/queries';
import { ipAssetsColumn } from './ip-assets-column';

interface Props {
  targetId?: string;
  refetchInterval?: number;
  selectedWorkspace?: string;
}

export default function IpAssetsTab({
  targetId,
  refetchInterval,
  selectedWorkspace,
}: Props) {
  const {
    tableParams: { page, pageSize, sortBy, sortOrder, filter },
    tableHandlers: { setPage, setPageSize, setSortBy, setSortOrder },
  } = useServerDataTable({
    defaultSortBy: 'value',
    defaultSortOrder: 'ASC',
  });

  const queryParams = {
    workspaceId: selectedWorkspace ?? '',
    targetIds: targetId ? [targetId] : undefined,
    value: filter,
    limit: pageSize,
    page,
    sortBy,
    sortOrder,
  };

  const queryOpts = {
    query: {
      refetchInterval: refetchInterval ?? 30 * 1000,
      queryKey: [
        'ipAssets',
        targetId,
        selectedWorkspace,
        page,
        filter,
        pageSize,
        sortBy,
        sortOrder,
      ],
    },
  };

  const { data, isLoading } = useAssetsControllerGetIpAssets(
    queryParams,
    queryOpts,
  );

  const ipAssets = data?.data ?? [];
  const total = data?.total ?? 0;

  if (!data && !isLoading) return <div>Error loading targets.</div>;

  return (
    <>
      <TabsContent value="ip" className="overflow-hidden">
        <DataTable
          data={ipAssets}
          columns={ipAssetsColumn}
          isLoading={isLoading}
          page={page}
          pageSize={pageSize}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          onSortChange={(col, order) => {
            setSortBy(col);
            setSortOrder(order);
          }}
          totalItems={total}
        />
      </TabsContent>
    </>
  );
}
