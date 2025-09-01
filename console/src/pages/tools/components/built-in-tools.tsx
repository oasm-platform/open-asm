import { Button } from "@/components/ui/button";
import { useToolsControllerGetBuiltInTools } from "@/services/apis/gen/queries";
import { Bolt, CheckCircle } from "lucide-react";
import ToolsList from "../tools-list";

const BuiltInTools = () => {
  const { data, isLoading } = useToolsControllerGetBuiltInTools();

  return (
    <ToolsList
      data={data?.data}
      isLoading={isLoading}
      icon={<Bolt className="w-6 h-6" />}
      title="Built-in tools"
      renderButton={() => (
        <Button color="green" disabled={true}>
          <CheckCircle className="w-4 h-4" />
          Installed
        </Button>
      )}
    />
  );
};

export default BuiltInTools;
