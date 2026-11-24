import Page from "@/components/common/page";
import { useT } from "@/lib/i18n-dictionary";
import { useProvidersControllerGetProvider, useProvidersControllerUpdateProvider, type UpdateProviderDto } from "@/services/apis/gen/queries";
import { Loader2 } from "lucide-react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { ProviderForm } from "./provider-form";

export default function EditProviderPage() {
  const t = useT();
  const { id } = useParams({ strict: false });
  const navigate = useNavigate();

  const { data: provider, isLoading } = useProvidersControllerGetProvider(id || '', {
    query: { enabled: !!id }
  });

  const { mutate, isPending } = useProvidersControllerUpdateProvider();

  const onSubmit = (data: UpdateProviderDto) => {
    mutate({
      id: id || '',
      data
    }, {
      onSuccess: () => {
        toast.success(t('providers.edit.success'));
        // Navigate back to the provider detail page
        navigate({ to: `/providers/${id}` });
      },
      onError: (error) => {
        toast.error(t('providers.edit.failed'));
        console.error("Error updating provider:", error);
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">{t('providers.notFound.title')}</h2>
        <p className="text-muted-foreground mt-2">
          {t('providers.notFound.description')}
        </p>
        <button
          className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded"
          onClick={() => window.history.back()}
        >
          {t('providers.notFound.goBack')}
        </button>
      </div>
    );
  }

  return (
    <Page title={t('providers.edit.title')} permission="agent.write">
      <div className="max-w-4xl mx-auto py-6">
        <div className="bg-card rounded-lg border p-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold">{t('providers.edit.title')}</h2>
            <p className="text-muted-foreground mt-2">
              {t('providers.edit.description')}
            </p>
          </div>

          <ProviderForm
            onSubmit={onSubmit}
            isPending={isPending}
            initialData={provider}
            submitButtonText={t('providers.edit.submit')}
          />
        </div>
      </div>
    </Page>
  );
}