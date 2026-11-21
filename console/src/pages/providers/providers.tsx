import Page from "@/components/common/page";
import { useT } from "@/lib/i18n-dictionary";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { ListProviders } from "./list-provider";

export default function ProvidersPage() {
  const t = useT();
  const navigate = useNavigate();

  const handleCreateProvider = () => {
    navigate({ to: "/providers/create" });
  };

  return (
    <Page
      title={t('providers.list.title')}
      permission="agent.read"
      header={
        <div className="flex items-center justify-end">
          <Button variant="outline" onClick={handleCreateProvider}>
            <Plus className="w-4 h-4 mr-2" />
            {t('common.create')}
          </Button>
        </div>
      }
    >
      <ListProviders />
    </Page>
  );
}