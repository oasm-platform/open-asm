import { ArrowLeft } from 'lucide-react';
import { Button } from '../ui/button';

interface PageProps {
  children?: React.ReactNode;
  title?: string | React.ReactNode;
  description?: string;
  header?: React.ReactNode;
  action?: React.ReactNode;
  isShowButtonGoBack?: boolean;
  className?: string;
}
const Page = ({
  children,
  title,
  description,
  header,
  action,
  isShowButtonGoBack,
  className,
}: PageProps) => {
  return (
    <div className={(className || '') + ' flex h-full flex-col gap-5'}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3">
          {isShowButtonGoBack && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => window.history.back()}
              className="size-9 shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
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
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
};

export default Page;
