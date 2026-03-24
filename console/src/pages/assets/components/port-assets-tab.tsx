import { CollapsibleDataTable } from '@/components/ui/collapsible-data-table';
import { DataTableError } from '@/components/ui/data-table-error-boundary';
import { TabsContent } from '@/components/ui/tabs';
import { useAssetsControllerGetPortAssets } from '@/services/apis/gen/queries';
import { useAsset } from '../context/asset-context';
import { AssetTable } from './asset-table';
import { portAssetsColumn } from './port-assets-column';

export default function PortAssetsTab() {
  const {
    tableHandlers: { setPage, setPageSize, setParams },
    tableParams: { page, pageSize, sortBy, sortOrder },
    queryParams,
    queryOptions,
    targetId,
  } = useAsset();

  const { data, isLoading, refetch } = useAssetsControllerGetPortAssets(queryParams, {
    query: {
      ...queryOptions.query,
      queryKey: ['ports', ...queryOptions.query.queryKey],
    },
  });

  const portAssets = data?.data ?? [];
  const total = data?.total ?? 0;

  if (!data && !isLoading)
    return <DataTableError message="Failed to load port assets." onRetry={refetch} />;

  return (
    <>
      <TabsContent value="port">
        <CollapsibleDataTable
          data={portAssets}
          columns={portAssetsColumn}
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
                ports: [row.port],
                targetIds: targetId ? [targetId] : undefined,
              }}
            />
          )}
        />
      </TabsContent>
    </>
  );
}
