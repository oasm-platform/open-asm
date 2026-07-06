import { DataTable } from '@/components/ui/data-table';
import { DataTableError } from '@/components/ui/data-table-error-boundary';
import { useAssetsControllerGetAssetsInWorkspace } from '@/services/apis/gen/queries';
import { useState } from 'react';
import { type AssetContextType } from '../context/asset-context';
import { assetColumns } from './asset-column';
import AssetDetailSheet from './asset-detail-sheet';

export function AssetTable({
  filter,
}: {
  filter: Partial<AssetContextType['queryParams']>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [rowID, setRowID] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const { data, isLoading, refetch } = useAssetsControllerGetAssetsInWorkspace(
    {
      page,
      limit: pageSize,
      ...filter,
    },
    { query: { queryKey: ['sub-assets-filter', page, pageSize, filter] } },
  );

  const assets = data?.data ?? [];
  const total = data?.total ?? 0;

  if (!data && !isLoading)
    return <DataTableError message="Failed to load assets." onRetry={refetch} />;
  return (
    <>
      <DataTable
        data={assets}
        columns={assetColumns}
        isLoading={isLoading}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        totalItems={total}
        isShowBorder={false}
        onRowClick={(row) => {
          setRowID(row.id);
          setIsOpen(true);
        }}
      />
      <AssetDetailSheet open={isOpen} setOpen={setIsOpen} id={rowID} />
    </>
  );
}
