import { DataTable } from '@/components/ui/data-table';
import { TabsContent } from '@/components/ui/tabs';
import { useAssetsControllerGetIpAssets } from '@/services/apis/gen/queries';
import { ipAssetsColumn } from './ip-assets-column';
import { useAssetTable } from './useAssetTable';

interface Props {
  targetId?: string;
  refetchInterval?: number;
}

export default function IpAssetsTab({ targetId, refetchInterval }: Props) {
  const {
    tableHandlers: { setPage, setPageSize, setSortBy, setSortOrder },
    tableParams: { page, pageSize, sortBy, sortOrder },
    queryOpts,
    queryParams,
  } = useAssetTable({ refetchInterval, targetId });

  const { data, isLoading } = useAssetsControllerGetIpAssets(
    queryParams,
    queryOpts,
  );

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
        />
      </TabsContent>
    </>
  );
}
