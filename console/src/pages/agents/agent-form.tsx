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
import { useNavigate } from 'react-router-dom';

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

const providerOptions: { value: CreateLLMConfigDtoProvider; label: string }[] =
  [
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'custom', label: 'Custom' },
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
  const navigate = useNavigate();
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
        <label className="text-sm font-medium">Provider *</label>
        <Controller
          name="provider"
          control={control}
          rules={{ required: 'Provider is required' }}
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(value) => {
                field.onChange(value);
              }}
              disabled={isEdit}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {providerOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
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
          {isEdit ? 'API Key (leave blank to keep unchanged)' : 'API Key *'}
        </label>
        <Input
          {...register('apiKey', {
            required: isEdit ? false : 'API Key is required',
          })}
          type="password"
          placeholder="sk-..."
        />
        {errors.apiKey && (
          <p className="text-red-600 text-sm">{errors.apiKey.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Model *</label>
        <Input
          {...register('model', { required: 'Model is required' })}
          placeholder={defaultModels[selectedProvider] ?? 'Enter model name'}
        />
        {errors.model && (
          <p className="text-red-600 text-sm">{errors.model.message}</p>
        )}
      </div>

      {isCustomProvider && (
        <div className="space-y-2">
          <label className="text-sm font-medium">API Endpoint URL *</label>
          <Input
            {...register('apiUrl', {
              required: isCustomProvider
                ? 'API URL is required for custom provider'
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
          onClick={() => navigate(-1)}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2Icon className="animate-spin mr-2" />}
          {submitButtonText}
        </Button>
      </div>
    </form>
  );
}
