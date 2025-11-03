import { CollapsibleDataTable } from '@/components/ui/collapsible-data-table';
import { TabsContent } from '@/components/ui/tabs';
import { useAssetsControllerGetPortAssets } from '@/services/apis/gen/queries';
import { useAsset } from '../context/asset-context';
import { AssetTable } from './asset-table';
import { portAssetsColumn } from './port-assets-column';

export default function PortAssetsTab() {
  const {
    tableHandlers: { setPage, setPageSize, setSortBy, setSortOrder },
    tableParams: { page, pageSize, sortBy, sortOrder },
    queryParams,
    queryOptions,
  } = useAsset();

  const { data, isLoading } = useAssetsControllerGetPortAssets(queryParams, {
    query: {
      ...queryOptions.query,
      queryKey: ['ports', ...queryOptions.query.queryKey],
    },
  });

  const portAssets = data?.data ?? [];
  const total = data?.total ?? 0;

  if (!data && !isLoading) return <div>Error loading targets.</div>;

  return (
    <>
      <TabsContent value="port" className="overflow-hidden">
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
            setSortBy(col);
            setSortOrder(order);
          }}
          totalItems={total}
          collapsibleElement={(row) => (
            <AssetTable
              filter={{
                ports: [row.port],
              }}
            ></AssetTable>
          )}
        />
      </TabsContent>
    </>
  );
}
