import { CollapsibleDataTable } from '@/components/ui/collapsible-data-table';
import { DataTableError } from '@/components/ui/data-table-error-boundary';
import { TabsContent } from '@/components/ui/tabs';
import { useAssetsControllerGetUrlAssets } from '@/services/apis/gen/queries';
import { useAsset } from '../context/asset-context';
import { AssetTable } from './asset-table';
import { urlAssetsColumn } from './url-assets-column';

export default function UrlAssetsTab() {
  const {
    tableHandlers: { setPage, setPageSize, setParams },
    tableParams: { page, pageSize, sortBy, sortOrder },
    queryParams,
    queryOptions,
    targetId,
  } = useAsset();

  const { data, isLoading, refetch } = useAssetsControllerGetUrlAssets(queryParams, {
    query: {
      ...queryOptions.query,
      queryKey: ['urls', ...queryOptions.query.queryKey],
    },
  });

  const urlAssets = data?.data ?? [];
  const total = data?.total ?? 0;

  if (!data && !isLoading)
    return <DataTableError message="Failed to load url assets." onRetry={refetch} />;

  return (
    <>
      <TabsContent value="urls">
        <CollapsibleDataTable
          data={urlAssets}
          columns={urlAssetsColumn}
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
                urls: [row.url],
                targetIds: targetId ? [targetId] : undefined,
              }}
            />
          )}
        />
      </TabsContent>
    </>
  );
}
