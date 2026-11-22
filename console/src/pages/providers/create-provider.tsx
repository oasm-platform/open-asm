import Page from "@/components/common/page";
import { useT } from "@/lib/i18n-dictionary";
import { useProvidersControllerCreateProvider } from "@/services/apis/gen/queries";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ProviderForm, type FormData } from "./provider-form";

export default function CreateProviderPage() {
  const t = useT();
  const { mutate, isPending } = useProvidersControllerCreateProvider();
  const navigate = useNavigate();

  const onSubmit = (data: FormData) => {
    mutate({
      data,
    }, {
      onSuccess: () => {
        toast.success(t('providers.create.success'));
        // Navigate back to the providers list page
        navigate({ to: "/providers" });
      },
      onError: (error) => {
        toast.error(t('providers.create.failed'));
        console.error("Error creating provider:", error);
      }
    });
  };

  return (
    <Page title={t('providers.create.title')} permission="agent.write">
      <div className="max-w-4xl mx-auto py-6">
        <div className="bg-card rounded-lg border p-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold">{t('providers.create.heading')}</h2>
            <p className="text-muted-foreground mt-2">
              {t('providers.create.description')}
            </p>
          </div>

          <ProviderForm
            onSubmit={onSubmit}
            isPending={isPending}
            submitButtonText={t('providers.create.title')}
          />
        </div>
      </div>
    </Page>
  );
}