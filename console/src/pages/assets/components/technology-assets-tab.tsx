import { DataTable } from '@/components/ui/data-table';
import { TabsContent } from '@/components/ui/tabs';
import { useAssetsControllerGetTechnologyAssets } from '@/services/apis/gen/queries';
import { useAsset } from '../context/asset-context';
import { technologyAssetsColumn } from './technology-assets-column';

export default function TechnologyAssetsTab() {
  const {
    tableHandlers: { setPage, setPageSize, setSortBy, setSortOrder },
    tableParams: { page, pageSize, sortBy, sortOrder },
    queryParams,
    queryOptions,
  } = useAsset();

  const { data, isLoading } = useAssetsControllerGetTechnologyAssets(
    queryParams,
    {
      query: {
        ...queryOptions.query,
        queryKey: ['assets', ...queryOptions.query.queryKey],
      },
    },
  );

  const technologyAssets = data?.data ?? [];
  const total = data?.total ?? 0;

  if (!data && !isLoading) return <div>Error loading targets.</div>;

  return (
    <>
      <TabsContent value="tech" className="overflow-hidden">
        <DataTable
          data={technologyAssets}
          columns={technologyAssetsColumn}
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
        />
      </TabsContent>
    </>
  );
}
