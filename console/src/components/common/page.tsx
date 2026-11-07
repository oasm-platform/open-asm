import { usePermission } from '@/hooks/usePermission';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import AccessDenied from './access-denied';

interface PageProps {
  children?: React.ReactNode;
  title?: string | React.ReactNode;
  description?: string;
  header?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  /** Classes of the title row, e.g. to line it up with narrower content */
  headerClassName?: string;
  /** Permission key required to view this page. Omit to allow any member. */
  permission?: string;
}
const Page = ({
  children,
  title,
  description,
  header,
  action,
  className,
  headerClassName,
  permission,
}: PageProps) => {
  const { hasPermission, isLoading } = usePermission();

  useEffect(() => {
    if (typeof title === 'string' && title) {
      document.title = `${title} | OASM`;
    }
    return () => {
      document.title = 'OASM';
    };
  }, [title]);

  const canRender = !permission || hasPermission(permission);

  return (
    <div className={(className || '') + ' flex h-full flex-col gap-5'}>
      <div
        className={cn(
          'flex flex-wrap items-end justify-between gap-3',
          headerClassName,
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            {title && (
              <span className="text-2xl font-semibold tracking-tight text-foreground">
                {title}
              </span>
            )}
            {description && (
              <span className="text-pretty text-sm text-muted-foreground">
                {description}
              </span>
            )}
          </div>
        </div>
        {(header || action) && (
          <div className="flex items-center gap-2">
            {header}
            {action}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-visible">
        {permission && isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : canRender ? (
          children
        ) : (
          <AccessDenied />
        )}
      </div>
    </div>
  );
};

export default Page;
