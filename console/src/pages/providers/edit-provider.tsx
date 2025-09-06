import Page from "@/components/common/page";
import { useProvidersControllerGetProvider, useProvidersControllerUpdateProvider, type UpdateProviderDto } from "@/services/apis/gen/queries";
import { Loader2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ProviderForm } from "./provider-form";

export default function EditProviderPage() {
  const { id } = useParams<{ id: string }>();
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
        toast.success("Provider updated successfully");
        // Navigate back to the provider detail page
        navigate(`/providers/${id}`);
      },
      onError: (error) => {
        toast.error("Failed to update provider");
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
        <h2 className="text-xl font-semibold">Provider not found</h2>
        <p className="text-muted-foreground mt-2">
          The provider you're looking for doesn't exist or you don't have permission to view it.
        </p>
        <button
          className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded"
          onClick={() => navigate(-1)}
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <Page title="Edit Provider" isShowButtonGoBack>
      <div className="max-w-4xl mx-auto py-6">
        <div className="bg-card rounded-lg border p-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold">Edit Provider</h2>
            <p className="text-muted-foreground mt-2">
              Update the details below to modify the tool provider.
            </p>
          </div>

          <ProviderForm
            onSubmit={onSubmit}
            isPending={isPending}
            initialData={provider}
            submitButtonText="Update Provider"
          />
        </div>
      </div>
    </Page>
  );
}