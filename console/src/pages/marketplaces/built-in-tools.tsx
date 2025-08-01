import { useToolsControllerGetBuiltInTools } from "@/services/apis/gen/queries";
import { Bolt } from "lucide-react";
import ToolCard from "./tool-card";
import ToolCardLoading from "./tool-card-loading";

const BuiltInTools = () => {
    const { data, isLoading } = useToolsControllerGetBuiltInTools();

    return (
        <div className="flex flex-col gap-4 py-4">
            <div className="flex items-center gap-2 text-blue-500">
                <Bolt className="w-6 h-6" />
                <span className="text font-bold">Built-in tools</span>
            </div>
            {isLoading ? (
                <ToolCardLoading />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {data?.data.map((tool) => (
                        <ToolCard key={tool.id} {...tool} />
                    ))}
                </div>
            )}
            {data?.data.length === 0 && <div className="flex items-center justify-center gap-2 text-blue-500">
                <Bolt className="w-6 h-6 text-gray-500" />  <span className="text-gray-500 text-xl font-bold">No tools found</span>
            </div>}
        </div>
    );
};

export default BuiltInTools;
