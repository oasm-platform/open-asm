import { type GetTechnologyAssetsDTO } from '@/services/apis/gen/queries';
import type { ColumnDef } from '@tanstack/react-table';
import { Boxes } from 'lucide-react';
import BadgeList from './badge-list';

export const technologyAssetsColumn: ColumnDef<GetTechnologyAssetsDTO>[] = [
  {
    accessorKey: 'technology',
    header: 'Technology',
    enableHiding: false,
    size: 250,
    cell: ({ row }) => {
      const data = row.original;
      const iconUrl = data.technology?.iconUrl as string;
      const categories = (data.technology?.categoryNames as string[]) || [];
      const version = data.technology?.version as string;

      return (
        <div className="flex items-center gap-3 py-2 ">
          <div className="flex items-center justify-center  bg-transparent  shadow p-2 rounded">
            {iconUrl ? (
              <img
                src={iconUrl}
                alt={data.technology?.name as string}
                className="size-8"
                onError={(e) => {
                  // Fallback to globe icon if image fails to load
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent) {
                    const globeIcon = document.createElement('div');
                    globeIcon.innerHTML =
                      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" class="lucide lucide-globe"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>';
                    parent.appendChild(globeIcon);
                  }
                }}
              />
            ) : (
              <Boxes className="size-8" />
            )}
          </div>
          <div className="flex flex-col gap-1">
            <div>
              {data.technology?.name as string} {version}
            </div>
            <div className="flex items-center gap-1">
              <BadgeList list={categories} maxDisplay={4} />
            </div>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'description',
    header: 'Description',
    enableHiding: false,
    cell: ({ row }) => {
      const data = row.original;
      return (
        <div className="flex items-center whitespace-normal">
          <p className="text-sm text-muted-foreground">
            {(data.technology?.description as string) ||
              'No description available'}
          </p>
        </div>
      );
    },
  },
  {
    accessorKey: 'assetCount',
    header: 'Number of services',
    enableSorting: true,
    size: 100,
    cell: ({ row }) => {
      const data = row.original;
      return (
        <div className="flex items-center ">
          {data.assetCount} {data.assetCount > 1 ? 'services' : 'service'}
        </div>
      );
    },
  },
];
