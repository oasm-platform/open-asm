import { CollapsibleDataTable } from '@/components/ui/collapsible-data-table';
import { DataTableError } from '@/components/ui/data-table-error-boundary';
import { TabsContent } from '@/components/ui/tabs';
import { useAssetsControllerGetTlsAssets } from '@/services/apis/gen/queries';
import { useAsset } from '../context/asset-context';
import { AssetTable } from './asset-table';
import { tlsAssetsColumn } from './tls-assets-column';

export default function TlsAssetsTab() {
  const {
    tableHandlers: { setPage, setPageSize, setParams },
    tableParams: { page, pageSize, sortBy, sortOrder },
    queryParams,
    queryOptions,
    targetId,
  } = useAsset();

  const { data, isLoading, refetch } = useAssetsControllerGetTlsAssets(
    {
      page: queryParams.page,
      limit: queryParams.limit,
      sortBy: queryParams.sortBy,
      sortOrder: queryParams.sortOrder,
      search: queryParams.value,
      targetIds: queryParams.targetIds,
      startDate: queryParams.startDate,
      endDate: queryParams.endDate,
    },
    {
      query: {
        ...queryOptions.query,
        queryKey: ['tlsAssets', ...queryOptions.query.queryKey],
      },
    },
  );

  const tlsAssets = data?.data ?? [];
  const total = data?.total ?? 0;

  if (!data && !isLoading)
    return <DataTableError message="Failed to load TLS assets." onRetry={refetch} />;

  return (
    <>
      <TabsContent value="tls">
        <CollapsibleDataTable
          data={tlsAssets}
          columns={tlsAssetsColumn}
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
                tlsHosts: row.host ? [row.host] : undefined,
                targetIds: targetId ? [targetId] : undefined,
              }}
            />
          )}
        />
      </TabsContent>
    </>
  );
}
