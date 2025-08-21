import { DataTable } from "@/components/ui/data-table";
import { Tabs } from "@/components/ui/tabs";
import { useServerDataTable } from "@/hooks/useServerDataTable";
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import { useAssetsControllerGetAssetsInWorkspace } from "@/services/apis/gen/queries";
import { TabsContent } from "@radix-ui/react-tabs";
import { useState } from "react";
import AssetDetailSheet from "./asset-detail-sheet";
import TriggerList from "./components/tab-trigger-list";
import FilterForm from "./components/filter-form";
import { assetColumns } from "./data-column";

interface ListAssetsProps {
  targetId?: string;
  refetchInterval?: number;
}
export function ListAssets({ targetId, refetchInterval }: ListAssetsProps) {
  const { selectedWorkspace } = useWorkspaceSelector();
  const [isOpen, setIsOpen] = useState(false);
  const [rowID, setRowID] = useState("");

  const {
    tableParams: { page, pageSize, sortBy, sortOrder, filter },
    tableHandlers: { setPage, setPageSize, setSortBy, setSortOrder },
  } = useServerDataTable({
    defaultSortBy: "value",
    defaultSortOrder: "ASC",
  });

  const { data, isLoading } = useAssetsControllerGetAssetsInWorkspace(
    {
      workspaceId: selectedWorkspace ?? "",
      targetIds: targetId ? [targetId] : undefined,
      value: filter,
      limit: pageSize,
      page,
      sortBy,
      sortOrder,
    },
    {
      query: {
        refetchInterval: refetchInterval ?? 5000,
        queryKey: [
          "assets",
          targetId,
          selectedWorkspace,
          page,
          filter,
          pageSize,
          sortBy,
          sortOrder,
        ],
      },
    },
  );

  const targets = data?.data ?? [];
  const total = data?.total ?? 0;

  if (!data && !isLoading) return <div>Error loading targets.</div>;

  const tabTriggerList = [
    {
      value: "asset",
      text: "All services",
    },
    {
      value: "ip",
      text: "IP",
    },
  ];

  return (
    <div className="w-full">
      <FilterForm />
      <Tabs defaultValue="asset" className="gap-0">
        <TriggerList tabTriggerList={tabTriggerList} />
        <TabsContent
          value="asset"
          className="border border-t-0 rounded-b-md bg-secondary overflow-hidden"
        >
          <DataTable
            data={targets}
            columns={assetColumns}
            isLoading={isLoading}
            isShowHeader={false}
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
        <TabsContent
          value="ip"
          className="border border-t-0 bg-secondary p-5 rounded-b-md"
        >
          No data
        </TabsContent>
      </Tabs>
      <AssetDetailSheet open={isOpen} setOpen={setIsOpen} id={rowID} />
    </div>
  );
}
