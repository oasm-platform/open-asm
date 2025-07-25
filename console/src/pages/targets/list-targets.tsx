import { type ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/data-table";
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import { useTargetsControllerGetTargetsInWorkspace } from "@/services/apis/gen/queries";

import TargetStatus from "@/components/ui/target-status";
import { useServerDataTable } from "@/hooks/useServerDataTable";
import type { JobStatus, Target } from "@/services/apis/gen/queries";
import { useNavigate } from "react-router-dom";

export const targetColumns: ColumnDef<Target, any>[] = [
  {
    accessorKey: "value",
    header: "Target",
    cell: ({ row }) => (
      <div className="font-medium">{row.getValue("value")}</div>
    ),
  },
  {
    accessorKey: "totalAssets",
    header: "Total assets",
    cell: ({ row }) => {
      const value: string = row.getValue("totalAssets");
      return (
        <div>
          <b>{value}</b> assets
        </div>
      );
    },
  },
  {
    accessorKey: "lastDiscoveredAt",
    header: "Last Discovered At",
    cell: ({ row }) => {
      const value: string = row.getValue("lastDiscoveredAt");
      return <div>{new Date(value).toLocaleString()}</div>;
    },
  },
  {
    accessorKey: "status",
    header: "Scan status",
    cell: ({ row }) => {
      const value: JobStatus = row.getValue("status");
      return <TargetStatus status={value} />;
    },
  },
];

export function ListTargets() {
  const { selectedWorkspace } = useWorkspaceSelector();

  const {
    tableParams: { page, pageSize, sortBy, sortOrder, filter },
    tableHandlers: { setPage, setPageSize, setSortBy, setSortOrder, setFilter },
  } = useServerDataTable();

  const { data, isLoading } = useTargetsControllerGetTargetsInWorkspace(
    {
      workspaceId: selectedWorkspace ?? "",
      limit: pageSize,
      page,
      sortBy,
      sortOrder,
      value: filter,
    },
    {
      query: {
        refetchInterval: 3000,
        queryKey: ["targets", selectedWorkspace],
      },
    },
  );

  const targets = data?.data ?? [];
  const total = data?.total ?? 0;

  if (!data && !isLoading) return <div>Error loading targets.</div>;

  const navigate = useNavigate();

  const handleRowClick = (target: Target) => {
    navigate(`/targets/${target.id}`);
  };

  return (
    <DataTable
      data={targets as any}
      columns={targetColumns}
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
      filterColumnKey="value"
      filterValue={filter}
      onFilterChange={setFilter}
      totalItems={total}
      onRowClick={handleRowClick}
      rowClassName="cursor-pointer hover:bg-muted/50 transition-colors"
    />
  );
}
