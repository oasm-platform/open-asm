import { CollapsibleDataTable } from '@/components/ui/collapsible-data-table';
import { TabsContent } from '@/components/ui/tabs';
import { useAssetsControllerGetStatusCodeAssets } from '@/services/apis/gen/queries';
import { useAsset } from '../context/asset-context';
import { AssetTable } from './asset-table';
import { statusCodeAssetsColumn } from './status-code-assets-column';

export default function StatusCodeAssetsTab() {
  const {
    tableHandlers: { setPage, setPageSize, setSortBy, setSortOrder },
    tableParams: { page, pageSize, sortBy, sortOrder },
    queryParams,
    queryOptions,
  } = useAsset();

  const { data, isLoading } = useAssetsControllerGetStatusCodeAssets(
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

  if (!data && !isLoading) return <div>Error loading targets.</div>;

  return (
    <>
      <TabsContent value="statusCode" className="overflow-hidden">
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
            setSortBy(col);
            setSortOrder(order);
          }}
          totalItems={total}
          collapsibleElement={(row) => (
            <AssetTable
              filter={{
                statusCodes: [row.statusCode],
              }}
            />
          )}
        />
      </TabsContent>
    </>
  );
}
