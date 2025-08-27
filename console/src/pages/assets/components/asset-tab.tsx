import { DataTable } from '@/components/ui/data-table';
import { TabsContent } from '@/components/ui/tabs';
import { useAssetsControllerGetAssetsInWorkspace } from '@/services/apis/gen/queries';
import { useState } from 'react';
import { assetColumns } from './asset-column';
import AssetDetailSheet from './asset-detail-sheet';
import { useAssetTable } from './useAssetTable';

interface Props {
  targetId?: string;
  refetchInterval?: number;
}

export default function AssetTab({ refetchInterval, targetId }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [rowID, setRowID] = useState('');

  const {
    tableHandlers: { setPage, setPageSize, setSortBy, setSortOrder },
    tableParams: { page, pageSize, sortBy, sortOrder },
    queryOpts,
    queryParams,
  } = useAssetTable({ refetchInterval, targetId });

  const { data, isLoading } = useAssetsControllerGetAssetsInWorkspace(
    queryParams,
    queryOpts,
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
            setIsOpen(!isOpen);
          }}
        />
      </TabsContent>
      <AssetDetailSheet open={isOpen} setOpen={setIsOpen} id={rowID} />
    </>
  );
}
