import Page from "@/components/common/page";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ListProviders } from "./list-provider";

export default function ProvidersPage() {
  const navigate = useNavigate();

  const handleCreateProvider = () => {
    navigate("/providers/create");
  };

  return (
    <Page
      title="Tool Providers"
      header={
        <div className="flex items-center justify-end">
          <Button variant="outline" onClick={handleCreateProvider}>
            <Plus className="w-4 h-4 mr-2" />
            Create
          </Button>
        </div>
      }
    >
      <ListProviders />
    </Page>
  );
}