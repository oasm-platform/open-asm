import { useT } from "@/lib/i18n-dictionary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2Icon } from "lucide-react";
import { useForm } from "react-hook-form";

export type FormData = {
  name: string;
  code: string;
  description: string;
  logoUrl: string;
  websiteUrl: string;
  supportEmail: string;
  company: string;
  licenseInfo: string;
  apiDocsUrl: string;
};

interface ProviderFormProps {
  onSubmit: (data: FormData) => void;
  isPending?: boolean;
  initialData?: Partial<FormData>;
  submitButtonText: string;
}

export function ProviderForm({
  onSubmit,
  isPending = false,
  initialData = {},
  submitButtonText
}: ProviderFormProps) {
  const t = useT();
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      name: initialData.name || '',
      code: initialData.code || '',
      description: initialData.description || '',
      logoUrl: initialData.logoUrl || '',
      websiteUrl: initialData.websiteUrl || '',
      supportEmail: initialData.supportEmail || '',
      company: initialData.company || '',
      licenseInfo: initialData.licenseInfo || '',
      apiDocsUrl: initialData.apiDocsUrl || '',
    }
  });

  const handleFormSubmit = (data: FormData) => {
    // Filter out empty fields to avoid sending them in the request
    const filteredData = Object.entries(data).reduce<Partial<FormData>>((acc, [key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        acc[key as keyof FormData] = value;
      }
      return acc;
    }, {});

    onSubmit(filteredData as FormData);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('providers.form.nameLabel')}</label>
          <Input
            {...register("name", { required: t('providers.form.nameRequired') })}
            placeholder={t('providers.form.namePlaceholder')}
          />
          {errors.name && <p className="text-red-600 text-sm">{errors.name.message}</p>}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('providers.form.codeLabel')}</label>
          <Input
            {...register("code", { required: t('providers.form.codeRequired') })}
            placeholder={t('providers.form.codePlaceholder')}
          />
          {errors.code && <p className="text-red-600 text-sm">{errors.code.message}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">{t('common.description')}</label>
        <Textarea
          {...register("description")}
          placeholder={t('providers.form.descriptionPlaceholder')}
          rows={4}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">{t('providers.form.company')}</label>
        <Input
          {...register("company")}
          placeholder={t('providers.form.companyPlaceholder')}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('providers.form.logoUrl')}</label>
          <Input
            {...register("logoUrl")}
            placeholder="https://example.com/logo.png"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('providers.form.websiteUrl')}</label>
          <Input
            {...register("websiteUrl")}
            placeholder="https://example.com"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('providers.form.supportEmail')}</label>
          <Input
            {...register("supportEmail")}
            placeholder="support@example.com"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('providers.form.apiDocsUrl')}</label>
          <Input
            {...register("apiDocsUrl")}
            placeholder="https://docs.example.com/api"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">{t('providers.form.licenseInfo')}</label>
        <Textarea
          {...register("licenseInfo")}
          placeholder={t('providers.form.licenseInfoPlaceholder')}
          rows={3}
        />
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => window.history.back()}
          disabled={isPending}
        >
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2Icon className="animate-spin mr-2" />}
          {submitButtonText}
        </Button>
      </div>
    </form>
  );
}