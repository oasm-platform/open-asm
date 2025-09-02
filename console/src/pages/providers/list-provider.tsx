import { type ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/data-table";
import { useProvidersControllerGetManyProviders } from "@/services/apis/gen/queries";

import { Badge } from "@/components/ui/badge";
import { useServerDataTable } from "@/hooks/useServerDataTable";
import type { ToolProvider } from "@/services/apis/gen/queries";

const providerColumns: ColumnDef<ToolProvider>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <div className="font-medium">{row.getValue("name")}</div>
    ),
  },
  {
    accessorKey: "code",
    header: "Code",
    cell: ({ row }) => {
      const value: string = row.getValue("code");
      return <div className="text-gray-500">{value}</div>;
    },
  },
  {
    accessorKey: "company",
    header: "Company",
    cell: ({ row }) => {
      const value: string = row.getValue("company");
      return <div>{value || "-"}</div>;
    },
  },
  {
    accessorKey: "websiteUrl",
    header: "Website",
    cell: ({ row }) => {
      const value: string = row.getValue("websiteUrl");
      return (
        <div className="text-blue-500 hover:underline">
          {value ? (
            <a href={value} target="_blank" rel="noopener noreferrer">
              Visit
            </a>
          ) : (
            "-"
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "isActive",
    header: "Status",
    cell: ({ row }) => {
      const value: boolean = row.getValue("isActive");
      return (
        <div className="flex items-center">
          <Badge
            variant={value ? "default" : "destructive"}
            className="text-xs font-medium"
          >
            {value ? "Active" : "Inactive"}
          </Badge>
        </div>
      );
    },
  },
];

export function ListProviders() {
  const {
    tableParams: { page, pageSize, sortBy, sortOrder, filter },
    tableHandlers: { setPage, setPageSize, setSortBy, setSortOrder, setFilter },
  } = useServerDataTable();

  const { data, isLoading } = useProvidersControllerGetManyProviders(
    {
      limit: pageSize,
      page,
      sortBy,
      sortOrder,
      name: filter || undefined, // Add name filter
    },
    {
      query: {
        queryKey: [
          "providers",
          pageSize,
          page,
          sortBy,
          sortOrder,
          filter, // Add filter to query key
        ],
      },
    },
  );

  const providers = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <DataTable
      data={providers}
      columns={providerColumns}
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
      filterColumnKey="name"
      filterValue={filter}
      onFilterChange={setFilter}
      totalItems={total}
    />
  );
}