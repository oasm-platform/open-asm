import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { useStatisticControllerGetTopAssetsWithMostVulnerabilities } from '@/services/apis/gen/queries';
import type { ColumnDef } from '@tanstack/react-table';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';

interface VulnerabilityAsset {
  asset: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  total: number;
  id: string;
}

const severityColors = {
  info: 'bg-stone-500',
  low: 'bg-yellow-500',
  medium: 'bg-orange-500',
  high: 'bg-red-500',
  critical: 'bg-red-700',
};

const severityOrder = ['info', 'low', 'medium', 'high', 'critical'] as const;

const TopAssetsVulnerabilitiesTable = () => {
  const navigate = useNavigate();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const {
    data: apiData,
    isLoading,
    error,
  } = useStatisticControllerGetTopAssetsWithMostVulnerabilities({
    query: {
      queryKey: ['top-assets-vulnerabilities', selectedWorkspaceId],
    },
  });

  const columns: ColumnDef<VulnerabilityAsset>[] = [
    {
      accessorKey: 'severity',
      header: 'Severity',
      size: 400,
      cell: ({ row }) => {
        const total = row.original.total || 0;

        if (total === 0) {
          return <div className="h-8 flex items-center"></div>;
        }

        return (
          <div className="h-8 flex items-center w-full">
            <div className="flex w-40 h-4 rounded-xl overflow-hidden">
              {severityOrder.map((severity) => {
                const count = row.original[severity] || 0;
                if (count === 0) return null;
                return (
                  <div
                    key={severity}
                    className={clsx(severityColors[severity])}
                    style={{ width: `${(count / total) * 100}%` }}
                  />
                );
              })}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'asset',
      header: 'Asset',
      cell: ({ row }) => (
        <div className="font-medium h-8 flex items-center">
          {row.getValue('asset') || ''}
        </div>
      ),
    },
    {
      accessorKey: 'total',
      header: 'Total',
      size: 100,
      cell: ({ row }) => {
        const total = row.getValue('total') as number;
        return (
          <div className="font-semibold h-8 flex items-center text-center">
            {total > 0 ? total : ''}
          </div>
        );
      },
    },
  ];

  const filteredData =
    apiData
      ?.filter((item) => item.total !== 0)
      .map((item) => ({
        asset: item.value,
        critical: item.critical,
        high: item.high,
        medium: item.medium,
        low: item.low,
        info: item.info,
        total: item.total,
        id: item.id,
      })) || [];

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top assets with most vulnerabilities</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="text-red-600">Error loading data</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="py-3 pt-6">
      <CardHeader>
        <CardTitle>Top assets with most vulnerabilities</CardTitle>
      </CardHeader>
      <CardContent className="p-4 py-0">
        <DataTable
          onRowClick={(row) =>
            row.asset && navigate(`/assets/?tab=host&hosts=${row.asset}`)
          }
          isShowBorder={false}
          columns={columns}
          data={filteredData}
          isLoading={isLoading}
          page={1}
          pageSize={10}
          totalItems={filteredData.length}
          showPagination={false}
          isShowHeader={true}
          minRows={10}
        />
      </CardContent>
    </Card>
  );
};

export default TopAssetsVulnerabilitiesTable;
