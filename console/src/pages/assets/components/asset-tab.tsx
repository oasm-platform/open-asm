import { DataTable } from '@/components/ui/data-table';
import { TabsContent } from '@/components/ui/tabs';
import { useAssetsControllerGetAssetsInWorkspace } from '@/services/apis/gen/queries';
import { useState } from 'react';
import { useAsset } from '../context/asset-context';
import { assetColumns } from './asset-column';
import AssetDetailSheet from './asset-detail-sheet';

export default function AssetTab() {
  const [isOpen, setIsOpen] = useState(false);
  const [rowID, setRowID] = useState('');

  const {
    tableHandlers: { setPage, setPageSize, setSortBy, setSortOrder },
    tableParams: { page, pageSize, sortBy, sortOrder },
    queryParams,
    queryOptions,
  } = useAsset();

  const { data, isLoading } = useAssetsControllerGetAssetsInWorkspace(
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

  if (!data && !isLoading) return <div>Error loading targets.</div>;

  return (
    <>
      <TabsContent value="asset" className="overflow-hidden">
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
            setSortBy(col);
            setSortOrder(order);
          }}
          totalItems={total}
          onRowClick={(row) => {
            setRowID(row.id);
            setIsOpen(true);
          }}
        />
      </TabsContent>
      <AssetDetailSheet open={isOpen} setOpen={setIsOpen} id={rowID} />
    </>
  );
}
