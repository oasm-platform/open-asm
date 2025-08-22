import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { Table, TableBody, TableRow } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { useServerDataTable } from "@/hooks/useServerDataTable";
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import {
  useAssetsControllerGetAssetIp,
  useAssetsControllerGetAssetsInWorkspace,
} from "@/services/apis/gen/queries";
import { TabsContent } from "@radix-ui/react-tabs";
import { ChevronDown, MapPinHouse } from "lucide-react";
import { useState } from "react";
import AssetDetailSheet from "./asset-detail-sheet";
import FilterForm from "./components/filter-form";
import TriggerList from "./components/tab-trigger-list";
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

  const { data: ipAssetData } = useAssetsControllerGetAssetIp({
    workspaceId: selectedWorkspace ?? "",
  });

  const targets = data?.data ?? [];
  const total = data?.total ?? 0;

  if (!data && !isLoading) return <div>Error loading targets.</div>;

  const tabTriggerList = [
    {
      value: "asset",
      text: "All Services",
    },
    {
      value: "ip",
      text: "IPs",
    },
  ];

  return (
    <div className="w-full">
      <FilterForm />
      <Tabs defaultValue="asset" className="gap-0">
        <TriggerList tabTriggerList={tabTriggerList} />
        <TabsContent value="asset" className="overflow-hidden">
          <DataTable
            data={targets}
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
        <TabsContent value="ip" className="overflow-hidden">
          <Table className="border rounded">
            <TableBody>
              {ipAssetData &&
                ipAssetData.data.map((e) => (
                  <TableRow className="h-15 flex items-center hover:cursor-pointer p-5 hover:bg-neutral-900 justify-between">
                    <div className="flex items-center gap-4">
                      <MapPinHouse className="size-4" />
                      <span>{e.ip}</span>
                      <Badge className="text-foreground bg-neutral-950 rounded border-neutral-600">
                        {e.assetCount} services
                      </Badge>
                    </div>
                    <div>
                      <ChevronDown className="size-4" />
                    </div>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
      <AssetDetailSheet open={isOpen} setOpen={setIsOpen} id={rowID} />
    </div>
  );
}
