import { CollapsibleDataTable } from '@/components/ui/collapsible-data-table';
import { DataTableError } from '@/components/ui/data-table-error-boundary';
import { TabsContent } from '@/components/ui/tabs';
import { useAssetsControllerGetHostAssets } from '@/services/apis/gen/queries';
import { useAsset } from '../context/asset-context';
import { AssetTable } from './asset-table';
import { hostAssetsColumn } from './host-assets-column';

export default function HostAssetsTab() {
  const {
    tableHandlers: { setPage, setPageSize, setParams },
    tableParams: { page, pageSize, sortBy, sortOrder },
    queryParams,
    queryOptions,
    targetId,
  } = useAsset();

  const { data, isLoading, refetch } = useAssetsControllerGetHostAssets(queryParams, {
    query: {
      ...queryOptions.query,
      queryKey: ['hosts', ...queryOptions.query.queryKey],
    },
  });

  const hostAssets = data?.data ?? [];
  const total = data?.total ?? 0;

  if (!data && !isLoading)
    return <DataTableError message="Failed to load host assets." onRetry={refetch} />;

  return (
    <>
      <TabsContent value="host">
        <CollapsibleDataTable
          data={hostAssets}
          columns={hostAssetsColumn}
          isLoading={isLoading}
          page={page}
          pageSize={pageSize}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          onSortChange={(col, order) => {
            setParams({ sortBy: col, sortOrder: order });
          }}
          totalItems={total}
          collapsibleElement={(row) => (
            <AssetTable
              filter={{
                hosts: [row.host],
                targetIds: targetId ? [targetId] : undefined,
              }}
            />
          )}
        />
      </TabsContent>
    </>
  );
}
