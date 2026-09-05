import type { Tool } from '@/services/apis/gen/queries';
import React, { type JSX, type ReactNode } from 'react';
import ToolCard from './components/tool-card';
import ToolCardLoading from './components/tool-card-loading';

interface ToolsListProps {
  data?: Tool[];
  isLoading: boolean;
  icon: ReactNode;
  emptyMessage?: string;
  emptyDescription?: string;
  renderButton: (tool: Tool) => ReactNode;
}

const ToolsList = ({
  data,
  isLoading,
  icon,
  emptyMessage = 'No tools found',
  emptyDescription,
  renderButton,
}: ToolsListProps) => {
  return (
    <div className="flex flex-col gap-4">
      {isLoading ? (
        <ToolCardLoading />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {data?.map((tool, index) => (
            <ToolCard key={tool.id ?? index} tool={tool} button={renderButton(tool)} />
          ))}
        </div>
      )}
      {(!data || data.length === 0) && !isLoading && (
        <div className="flex flex-col items-center justify-center gap-1 py-16 text-center">
          {icon &&
            React.cloneElement(icon as JSX.Element, {
              className: 'w-6 h-6 text-gray-500',
            })}
          <span className="text-lg font-semibold text-gray-500">
            {emptyMessage}
          </span>
          {emptyDescription && (
            <p className="max-w-sm text-sm text-muted-foreground">
              {emptyDescription}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default ToolsList;
