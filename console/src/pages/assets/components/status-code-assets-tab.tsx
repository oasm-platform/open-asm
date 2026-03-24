import { CollapsibleDataTable } from '@/components/ui/collapsible-data-table';
import { DataTableError } from '@/components/ui/data-table-error-boundary';
import { TabsContent } from '@/components/ui/tabs';
import { useAssetsControllerGetStatusCodeAssets } from '@/services/apis/gen/queries';
import { useAsset } from '../context/asset-context';
import { AssetTable } from './asset-table';
import { statusCodeAssetsColumn } from './status-code-assets-column';

export default function StatusCodeAssetsTab() {
  const {
    tableHandlers: { setPage, setPageSize, setParams },
    tableParams: { page, pageSize, sortBy, sortOrder },
    queryParams,
    queryOptions,
    targetId,
  } = useAsset();

  const { data, isLoading, refetch } = useAssetsControllerGetStatusCodeAssets(
    queryParams,
    {
      query: {
        ...queryOptions.query,
        queryKey: ['statusCode', ...queryOptions.query.queryKey],
      },
    },
  );

  const statusCodeAssets = data?.data ?? [];
  const total = data?.total ?? 0;

  if (!data && !isLoading)
    return <DataTableError message="Failed to load status code assets." onRetry={refetch} />;

  return (
    <>
      <TabsContent value="status-code">
        <CollapsibleDataTable
          data={statusCodeAssets}
          columns={statusCodeAssetsColumn}
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
                statusCodes: [row.statusCode],
                targetIds: targetId ? [targetId] : undefined,
              }}
            />
          )}
        />
      </TabsContent>
    </>
  );
}
