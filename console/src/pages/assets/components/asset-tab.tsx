import { DataTable } from '@/components/ui/data-table';
import { DataTableError } from '@/components/ui/data-table-error-boundary';
import { TabsContent } from '@/components/ui/tabs';
import { useAssetsControllerGetAssetsInWorkspace } from '@/services/apis/gen/queries';
import { useAsset } from '../context/asset-context';
import { assetColumns } from './asset-column';
import { useNavigate } from '@tanstack/react-router';

export default function AssetTab() {
  const navigate = useNavigate();

  const {
    tableHandlers: { setPage, setPageSize, setParams },
    tableParams: { page, pageSize, sortBy, sortOrder },
    queryParams,
    queryOptions,
  } = useAsset();

  const { data, isLoading, refetch } = useAssetsControllerGetAssetsInWorkspace(
    queryParams,
    {
      query: {
        ...queryOptions.query,
        queryKey: ['assets', ...queryOptions.query.queryKey],
      },
    },
  );

  const assets = data?.data ?? [];
  const total = data?.total ?? 0;

  if (!data && !isLoading)
    return (
      <DataTableError message="Failed to load assets." onRetry={refetch} />
    );

  return (
    <TabsContent value="service" className="[&_div.my-4:first-child]:mt-0">
      <DataTable
        data={assets}
        columns={assetColumns}
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
        onRowClick={(row) => {
          navigate({ to: `/assets/services/${row.id}` });
        }}
      />
    </TabsContent>
  );
}
