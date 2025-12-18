import { CollapsibleDataTable } from '@/components/ui/collapsible-data-table';
import { TabsContent } from '@/components/ui/tabs';
import { useAssetsControllerGetHostAssets } from '@/services/apis/gen/queries';
import { useAsset } from '../context/asset-context';
import { AssetTable } from './asset-table';
import { hostAssetsColumn } from './host-assets-column';

export default function HostAssetsTab() {
  const {
    tableHandlers: { setPage, setPageSize, setSortBy, setSortOrder },
    tableParams: { page, pageSize, sortBy, sortOrder },
    queryParams,
    queryOptions,
    targetId,
  } = useAsset();

  const { data, isLoading } = useAssetsControllerGetHostAssets(queryParams, {
    query: {
      ...queryOptions.query,
      queryKey: ['hosts', ...queryOptions.query.queryKey],
    },
  });

  const hostAssets = data?.data ?? [];
  const total = data?.total ?? 0;

  if (!data && !isLoading) return <div>Error loading targets.</div>;

  return (
    <>
      <TabsContent value="host" className="overflow-hidden">
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
            setSortBy(col);
            setSortOrder(order);
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
