import { CollapsibleDataTable } from '@/components/ui/collapsible-data-table';
import { DataTableError } from '@/components/ui/data-table-error-boundary';
import { TabsContent } from '@/components/ui/tabs';
import { useAssetsControllerGetIpAssets } from '@/services/apis/gen/queries';
import { useAsset } from '../context/asset-context';
import { ipAssetsColumn } from './ip-assets-column';
import { AssetTable } from './asset-table';

export default function IpAssetsTab() {
  const {
    tableHandlers: { setPage, setPageSize, setParams },
    tableParams: { page, pageSize, sortBy, sortOrder },
    queryParams,
    queryOptions,
    targetId,
  } = useAsset();

  const { data, isLoading, refetch } = useAssetsControllerGetIpAssets(queryParams, {
    query: {
      ...queryOptions.query,
      queryKey: ['ipAssets', ...queryOptions.query.queryKey],
    },
  });

  const ipAssets = data?.data ?? [];
  const total = data?.total ?? 0;

  if (!data && !isLoading)
    return <DataTableError message="Failed to load IP assets." onRetry={refetch} />;

  return (
    <>
      <TabsContent value="ip">
        <CollapsibleDataTable
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
            setParams({ sortBy: col, sortOrder: order });
          }}
          totalItems={total}
          collapsibleElement={(row) => (
            <AssetTable
              filter={{
                ipAddresses: [row.ip],
                targetIds: targetId ? [targetId] : undefined,
              }}
            />
          )}
        />
      </TabsContent>
    </>
  );
}
