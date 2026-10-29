import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import type { ArtifactFolderPathItemDto } from '@/services/apis/gen/queries';
import { FolderOpen } from 'lucide-react';
import { Fragment } from 'react';

interface FolderBreadcrumbProps {
  path: ArtifactFolderPathItemDto[];
  onNavigate: (folderId: string | null) => void;
}

export function FolderBreadcrumb({ path, onNavigate }: FolderBreadcrumbProps) {
  const crumbs = [{ id: null, name: 'My files' }, ...path];

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => (
          <Fragment key={crumb.id ?? 'root'}>
            {index > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {index === crumbs.length - 1 ? (
                <BreadcrumbPage>{crumb.name}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1.5"
                    onClick={() => onNavigate(crumb.id)}
                  >
                    {index === 0 && <FolderOpen className="h-3.5 w-3.5" />}
                    {crumb.name}
                  </button>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
