import Page from "@/components/common/page";
import { useProvidersControllerCreateProvider } from "@/services/apis/gen/queries";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ProviderForm, type FormData } from "./provider-form";

export default function CreateProviderPage() {
  const { mutate, isPending } = useProvidersControllerCreateProvider();
  const navigate = useNavigate();

  const onSubmit = (data: FormData) => {
    mutate({
      data,
    }, {
      onSuccess: () => {
        toast.success("Provider created successfully");
        // Navigate back to the providers list page
        navigate("/providers");
      },
      onError: (error) => {
        toast.error("Failed to create provider");
        console.error("Error creating provider:", error);
      }
    });
  };

  return (
    <Page title="Create Provider" isShowButtonGoBack>
      <div className="max-w-4xl mx-auto py-6">
        <div className="bg-card rounded-lg border p-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold">Create New Provider</h2>
            <p className="text-muted-foreground mt-2">
              Fill in the details below to create a new tool provider.
            </p>
          </div>

          <ProviderForm
            onSubmit={onSubmit}
            isPending={isPending}
            submitButtonText="Create Provider"
          />
        </div>
      </div>
    </Page>
  );
}