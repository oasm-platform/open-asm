import { type ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
dayjs.extend(duration);

import { DataTable } from "@/components/ui/data-table";
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import { useTargetsControllerGetTargetsInWorkspace } from "@/services/apis/gen/queries";

import TargetStatus from "@/components/ui/target-status";
import { useServerDataTable } from "@/hooks/useServerDataTable";
import type {
  GetManyTargetResponseDto,
  JobStatus,
} from "@/services/apis/gen/queries";
import { useNavigate } from "react-router-dom";
import CreateWorkspace from "../workspaces/create-workspace";

const targetColumns: ColumnDef<GetManyTargetResponseDto>[] = [
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
    accessorKey: "duration",
    header: "Duration",
    cell: ({ row }) => {
      const status = row.getValue("status");
      if (status === "in_progress") {
        return null;
      }

      const value: number = parseInt(row.getValue("duration"));
      const duration = dayjs.duration(value, "seconds");
      const hours = duration.hours();
      const minutes = duration.minutes();
      const seconds = duration.seconds();

      return (
        <div className="text-gray-400 font-semibold">
          {hours > 0 && `${hours}h`}
          {minutes > 0 && `${minutes}m`}
          {seconds > 0 && `${seconds}s`}
        </div>
      );
    },
  },
  {
    accessorKey: "lastDiscoveredAt",
    header: "Last Discovered At",
    cell: ({ row }) => {
      const value: string = row.getValue("lastDiscoveredAt");
      return (
        <div className="text-gray-400 font-semibold">
          {new Date(value).toLocaleString()}
        </div>
      );
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
  const { selectedWorkspace, workspaces } = useWorkspaceSelector();
  const navigate = useNavigate();

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
        queryKey: [
          "targets",
          selectedWorkspace,
          pageSize,
          page,
          sortBy,
          sortOrder,
          filter,
        ],
      },
    },
  );

  const targets = data?.data ?? [];
  const total = data?.total ?? 0;

  if (workspaces.length === 0) return <CreateWorkspace />;
  if (!data && !isLoading) return <div>Error loading targets.</div>;

  const handleRowClick = (target: GetManyTargetResponseDto) => {
    navigate(`/targets/${target.id}`);
  };

  return (
    <DataTable
      data={targets}
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
