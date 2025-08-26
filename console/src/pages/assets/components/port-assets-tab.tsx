import { DataTable } from "@/components/ui/data-table";
import { TabsContent } from "@/components/ui/tabs";
import { useServerDataTable } from "@/hooks/useServerDataTable";
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import {
  useAssetsControllerGetPortAssets,
  type GetPortAssetsDTO,
} from "@/services/apis/gen/queries";
import type { ColumnDef } from "@tanstack/react-table";

interface Props {
  targetId?: string;
  refetchInterval?: number;
}

const portAssetsColumn: ColumnDef<GetPortAssetsDTO>[] = [
  {
    accessorKey: "port",
    header: "Port",
    enableHiding: false,
    size: 500,
    cell: ({ row }) => {
      const data = row.original;
      return (
        <div className="flex flex-col gap-2 py-2 justify-center items-start max-w-[500px]">
          {data.port}
        </div>
      );
    },
  },
  {
    accessorKey: "assetCount",
    header: "Number of assets",
    size: 250,
    cell: ({ row }) => {
      const data = row.original;

      return (
        <div className="flex flex-wrap gap-1 items-center">
          {data.assetCount}
        </div>
      );
    },
  },
];

export default function PortAssetsTab({ targetId, refetchInterval }: Props) {
  const { selectedWorkspace } = useWorkspaceSelector();

  const {
    tableParams: { page, pageSize, sortBy, sortOrder, filter },
    tableHandlers: { setPage, setPageSize, setSortBy, setSortOrder },
  } = useServerDataTable({
    defaultSortBy: "value",
    defaultSortOrder: "ASC",
  });

  const queryParams = {
    workspaceId: selectedWorkspace ?? "",
    targetIds: targetId ? [targetId] : undefined,
    value: filter,
    limit: pageSize,
    page,
    sortBy,
    sortOrder,
  };

  const queryOpts = {
    query: {
      refetchInterval: refetchInterval ?? (false as const),
      queryKey: [
        "portAssets",
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

  const { data, isLoading } = useAssetsControllerGetPortAssets(
    queryParams,
    queryOpts,
  );

  const portAssets = data?.data ?? [];
  const total = data?.total ?? 0;

  if (!data && !isLoading) return <div>Error loading targets.</div>;

  return (
    <>
      <TabsContent value="port" className="overflow-hidden">
        <DataTable
          data={portAssets}
          columns={portAssetsColumn}
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
