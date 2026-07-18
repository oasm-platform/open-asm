import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { LLMConfigWithProviderDto } from '@/services/apis/gen/queries';
import { LLMConfigWithProviderDtoProviderId } from '@/services/apis/gen/queries';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { getConnectSchema, type ConnectFormData } from './schema';

export function ConnectForm({
  provider,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  provider: LLMConfigWithProviderDto;
  onSubmit: (data: ConnectFormData, providerId: string) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const isCustomProvider =
    provider.providerId === LLMConfigWithProviderDtoProviderId.custom;
  const schema = useMemo(
    () =>
      getConnectSchema(
        isCustomProvider,
        provider.isAcceptCustomApiUrl ?? false,
      ),
    [isCustomProvider, provider.isAcceptCustomApiUrl],
  );

  const {
    register,
    handleSubmit: handleFormSubmit,
    formState: { errors },
  } = useForm<ConnectFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: provider.providerName ?? '',
      apiUrl: '',
      apiKey: '',
    },
  });

  const isApiKeyOptional = isCustomProvider || provider.isAcceptCustomApiUrl;

  return (
    <form
      onSubmit={handleFormSubmit((data) => onSubmit(data, provider.providerId))}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">Name</label>
        <Input
          {...register('name')}
          placeholder="e.g. My Work Key"
          autoComplete="off"
          autoFocus
          onFocus={(e) => e.target.select()}
        />
        <p className="text-xs text-muted-foreground">
          A friendly name to identify this configuration later.
        </p>
      </div>

      {provider.isAcceptCustomApiUrl && (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">
            API Endpoint
          </label>
          <Input
            {...register('apiUrl')}
            type="url"
            placeholder="https://api.myprovider.com/v1"
            autoComplete="off"
            error={errors.apiUrl?.message}
          />
          <p className="text-xs text-muted-foreground">
            Base URL for the provider&apos;s API (e.g. OpenAI-compatible
            endpoints).
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">
          API Key{' '}
          {!isApiKeyOptional && <span className="text-destructive">*</span>}
        </label>
        <Input
          {...register('apiKey')}
          type="password"
          placeholder={isApiKeyOptional ? '(optional)' : ''}
          autoComplete="new-password"
          error={errors.apiKey?.message}
        />
        <p className="text-xs text-muted-foreground">
          {isApiKeyOptional
            ? 'Your API key is stored securely and never shared.'
            : 'Required. Your API key is stored securely and never shared.'}
        </p>
      </div>

      <div className="flex justify-between items-center gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? 'Connecting...' : 'Connect'}
        </Button>
      </div>
    </form>
  );
}
