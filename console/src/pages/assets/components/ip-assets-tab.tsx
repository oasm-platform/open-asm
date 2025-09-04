import { DataTable } from '@/components/ui/data-table';
import { TabsContent } from '@/components/ui/tabs';
import { useAssetsControllerGetIpAssets } from '@/services/apis/gen/queries';
import { useAsset } from '../context/asset-context';
import { ipAssetsColumn } from './ip-assets-column';

export default function IpAssetsTab() {
  const {
    tableHandlers: { setPage, setPageSize, setSortBy, setSortOrder },
    tableParams: { page, pageSize, sortBy, sortOrder },
    queryParams,
    queryOptions,
    filterParams,
    filterHandlers,
  } = useAsset();

  const { data, isLoading } = useAssetsControllerGetIpAssets(queryParams, {
    query: {
      ...queryOptions.query,
      queryKey: ['ipAssets', ...queryOptions.query.queryKey],
    },
  });

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
          onRowClick={(row) => {
            let selectedValue = filterParams.ipAddresses || [];
            if (selectedValue.indexOf(row.ip.toString()) < 0) {
              selectedValue = [...selectedValue, row.ip];
              filterHandlers('ipAddresses', selectedValue);
            }
          }}
        />
      </TabsContent>
    </>
  );
}
