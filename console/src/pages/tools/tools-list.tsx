import type { Tool } from "@/services/apis/gen/queries";
import React, { type JSX, type ReactNode } from "react";
import ToolCard from "./components/tool-card";
import ToolCardLoading from "./components/tool-card-loading";

interface ToolsListProps {
  data?: Tool[];
  isLoading: boolean;
  icon: ReactNode;
  title: string;
  emptyMessage?: string;
  renderButton: (tool: Tool) => ReactNode;
}

const ToolsList = ({
  data,
  isLoading,
  icon,
  title,
  emptyMessage = "No tools found",
  renderButton,
}: ToolsListProps) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-blue-500">
        {icon}
        <span className="text font-bold">{title}</span>
      </div>
      {isLoading ? (
        <ToolCardLoading />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {data?.map((tool) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              button={renderButton(tool)}
            />
          ))}
        </div>
      )}
      {data?.length === 0 && !isLoading && (
        <div className="flex items-center justify-center gap-2 text-blue-500">
          {icon && React.cloneElement(icon as JSX.Element, { className: "w-6 h-6 text-gray-500" })}
          <span className="text-gray-500 text-xl font-bold">
            {emptyMessage}
          </span>
        </div>
      )}
    </div>
  );
};

export default ToolsList;