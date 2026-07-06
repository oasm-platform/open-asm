import { CollapsibleDataTable } from '@/components/ui/collapsible-data-table';
import { DataTableError } from '@/components/ui/data-table-error-boundary';
import { TabsContent } from '@/components/ui/tabs';
import { useAssetsControllerGetTechnologyAssets } from '@/services/apis/gen/queries';
import { useAsset } from '../context/asset-context';
import { AssetTable } from './asset-table';
import { technologyAssetsColumn } from './technology-assets-column';

export default function TechnologyAssetsTab() {
  const {
    tableHandlers: { setPage, setPageSize, setParams },
    tableParams: { page, pageSize, sortBy, sortOrder },
    queryParams,
    queryOptions,
    targetId,
  } = useAsset();

  const { data, isLoading, refetch } = useAssetsControllerGetTechnologyAssets(
    queryParams,
    {
      query: {
        ...queryOptions.query,
        queryKey: ['technology', ...queryOptions.query.queryKey],
      },
    },
  );

  const technologyAssets = data?.data ?? [];
  const total = data?.total ?? 0;

  if (!data && !isLoading)
    return (
      <DataTableError
        message="Failed to load technology assets."
        onRetry={refetch}
      />
    );

  return (
    <>
      <TabsContent value="technology">
        <CollapsibleDataTable
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
            setParams({ sortBy: col, sortOrder: order });
          }}
          totalItems={total}
          collapsibleElement={(row) => {
            const techFilter = row.technology.version
              ? `${row.technology.name}:${row.technology.version}`
              : row.technology.name;
            return (
              <AssetTable
                filter={{
                  techs: [techFilter],
                  targetIds: targetId ? [targetId] : undefined,
                }}
              />
            );
          }}
        />
      </TabsContent>
    </>
  );
}
