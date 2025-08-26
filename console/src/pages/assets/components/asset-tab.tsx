import { DataTable } from '@/components/ui/data-table';
import { TabsContent } from '@/components/ui/tabs';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { useAssetsControllerGetAssetsInWorkspace } from '@/services/apis/gen/queries';
import { useState } from 'react';
import { assetColumns } from './asset-column';
import AssetDetailSheet from './asset-detail-sheet';

interface Props {
  targetId?: string;
  refetchInterval?: number;
}

export default function AssetTab({ targetId, refetchInterval }: Props) {
  const { selectedWorkspace } = useWorkspaceSelector();
  const [isOpen, setIsOpen] = useState(false);
  const [rowID, setRowID] = useState('');

  const {
    tableParams: { page, pageSize, sortBy, sortOrder, filter },
    tableHandlers: { setPage, setPageSize, setSortBy, setSortOrder },
  } = useServerDataTable({
    defaultSortBy: 'value',
    defaultSortOrder: 'ASC',
  });

  const queryParams = {
    workspaceId: selectedWorkspace ?? '',
    targetIds: targetId ? [targetId] : undefined,
    value: filter,
    limit: pageSize,
    page,
    sortBy,
    sortOrder,
  };

  const queryOpts = {
    query: {
      refetchInterval: refetchInterval ?? 30 * 1000,
      queryKey: [
        'assets',
        targetId,
        selectedWorkspace,
        page,
        filter,
        pageSize,
        sortBy,
        sortOrder,
      ],
    },
  };

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
