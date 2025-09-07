import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import { ToolsControllerGetManyToolsCategory, ToolsControllerGetManyToolsType, useToolsControllerGetManyTools } from "@/services/apis/gen/queries";
import { LayoutGrid } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import ToolsList from "../tools-list";
import ToolInstallButton from "./tool-install-button";

const Marketplace = () => {
  const { selectedWorkspace } = useWorkspaceSelector();
  const [searchParams] = useSearchParams();
  const category = searchParams.get("category") ?? "";
  const { data, isLoading } = useToolsControllerGetManyTools({
    type: ToolsControllerGetManyToolsType.provider,
    category: category as ToolsControllerGetManyToolsCategory,
  }, {
    query: {
      queryKey: [selectedWorkspace, category]
    }
  });
  return (
    <div className="mt-8">
      <ToolsList
        data={data?.data}
        isLoading={isLoading}
        icon={<LayoutGrid className="w-6 h-6" />}
        title="Marketplace"
        renderButton={(tool) => (
          <ToolInstallButton
            tool={tool}
            workspaceId={selectedWorkspace}
          />
        )}
      />
    </div>
  );
};

export default Marketplace;
