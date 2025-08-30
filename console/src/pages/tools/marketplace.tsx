import { ToolsControllerGetManyToolsType, useToolsControllerGetManyTools } from "@/services/apis/gen/queries";
import { Package } from "lucide-react";
import ToolCard from "./tool-card";
import ToolCardLoading from "./tool-card-loading";
import ToolInstallButton from "./tool-install-button";

const Marketplace = () => {
  const { data, isLoading } = useToolsControllerGetManyTools({
    type: ToolsControllerGetManyToolsType.provider
  });

  return (
    <div className="flex flex-col gap-4 py-4 mt-8">
      <div className="flex items-center gap-2 text-blue-500">
        <Package className="w-6 h-6" />
        <span className="text font-bold">Marketplaces</span>
      </div>
      {isLoading ? (
        <ToolCardLoading />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-4">
          {data?.data.map((tool) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              button={<ToolInstallButton tool={tool} />}
            />
          ))}
        </div>
      )}
      {data?.data.length === 0 && !isLoading && (
        <div className="flex items-center justify-center gap-2 text-blue-500">
          <Package className="w-6 h-6 text-gray-500" />{" "}
          <span className="text-gray-500 text-xl font-bold">
            No tools found
          </span>
        </div>
      )}
    </div>
  );
};

export default Marketplace;