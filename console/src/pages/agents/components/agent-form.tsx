import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CreateLLMConfigDtoProvider } from '@/services/apis/gen/queries';
import { Loader2Icon } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { useT } from '@/lib/i18n-dictionary';

export type AgentFormData = {
  provider: CreateLLMConfigDtoProvider;
  apiKey: string;
  model: string;
  apiUrl?: string;
};

interface AgentFormProps {
  onSubmit: (data: AgentFormData) => void;
  isPending?: boolean;
  initialData?: Partial<AgentFormData>;
  submitButtonText: string;
  isEdit?: boolean;
}

const providerOptions: {
  value: CreateLLMConfigDtoProvider;
  label: string;
  /** Translated name; brand names stay as they are */
  labelKey?: string;
}[] =
  [
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'custom', label: 'Custom', labelKey: 'agents.form.custom' },
  ];

const defaultModels: Record<string, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  custom: '',
};

export function AgentForm({
  onSubmit,
  isPending = false,
  initialData = {},
  submitButtonText,
  isEdit = false,
}: AgentFormProps) {
  const t = useT();
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<AgentFormData>({
    defaultValues: {
      provider: initialData.provider ?? 'openai',
      apiKey: initialData.apiKey ?? '',
      model: initialData.model ?? '',
      apiUrl: initialData.apiUrl ?? '',
    },
  });

  const selectedProvider = watch('provider');
  const isCustomProvider = selectedProvider === 'custom';

  const handleFormSubmit = (data: AgentFormData) => {
    const filteredData = Object.entries(data).reduce<Partial<AgentFormData>>(
      (acc, [key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          (acc as Record<string, unknown>)[key] = value;
        }
        return acc;
      },
      {},
    );

    onSubmit(filteredData as AgentFormData);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      <div className="space-y-2">
        <label className="text-sm font-medium">{t('agents.form.provider')}</label>
        <Controller
          name="provider"
          control={control}
          rules={{ required: t('agents.form.providerRequired') }}
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(value) => {
                field.onChange(value);
              }}
              disabled={isEdit}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('agents.form.selectProvider')} />
              </SelectTrigger>
              <SelectContent>
                {providerOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.labelKey ? t(option.labelKey) : option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.provider && (
          <p className="text-red-600 text-sm">{errors.provider.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">
          {isEdit ? t('agents.form.apiKeyEdit') : t('agents.form.apiKey')}
        </label>
        <Input
          {...register('apiKey', {
            required: isEdit ? false : t('agents.form.apiKeyRequired'),
          })}
          type="password"
          placeholder="sk-..."
        />
        {errors.apiKey && (
          <p className="text-red-600 text-sm">{errors.apiKey.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">{t('agents.form.model')}</label>
        <Input
          {...register('model', { required: t('agents.form.modelRequired') })}
          placeholder={defaultModels[selectedProvider] ?? t('agents.form.modelPlaceholder')}
        />
        {errors.model && (
          <p className="text-red-600 text-sm">{errors.model.message}</p>
        )}
      </div>

      {isCustomProvider && (
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('agents.form.apiUrl')}</label>
          <Input
            {...register('apiUrl', {
              required: isCustomProvider
                ? t('agents.form.apiUrlRequired')
                : false,
            })}
            placeholder="https://api.example.com/v1"
          />
          {errors.apiUrl && (
            <p className="text-red-600 text-sm">{errors.apiUrl.message}</p>
          )}
        </div>
      )}

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
