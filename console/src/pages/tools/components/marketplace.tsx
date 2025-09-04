import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import { ToolsControllerGetManyToolsType, useToolsControllerGetManyTools } from "@/services/apis/gen/queries";
import { LayoutGrid } from "lucide-react";
import ToolsList from "../tools-list";
import ToolInstallButton from "./tool-install-button";

const Marketplace = () => {
  const { selectedWorkspace } = useWorkspaceSelector();
  const { data, isLoading } = useToolsControllerGetManyTools({
    type: ToolsControllerGetManyToolsType.provider,
  }, {
    query: {
      queryKey: [selectedWorkspace]
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
