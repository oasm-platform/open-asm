import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { LLMConfigWithProviderDto } from '@/services/apis/gen/queries';
import { LLMConfigWithProviderDtoProviderId } from '@/services/apis/gen/queries';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { getConnectSchema, type ConnectFormData } from './schema';
import { useT } from '@/lib/i18n-dictionary';

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
  const t = useT();
  const isCustomProvider =
    provider.providerId === LLMConfigWithProviderDtoProviderId.custom;
  const schema = useMemo(
    () =>
      getConnectSchema(
        isCustomProvider,
        provider.isAcceptCustomApiUrl ?? false,
        t,
      ),
    [isCustomProvider, provider.isAcceptCustomApiUrl, t],
  );

  const {
    register,
    handleSubmit: handleFormSubmit,
    formState: { errors },
  } = useForm<ConnectFormData>({
    resolver: zodResolver(schema) as Resolver<ConnectFormData>,
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
        <label className="text-sm font-medium text-foreground">{t('agents.connect.name')}</label>
        <Input
          {...register('name')}
          placeholder={t('agents.connect.namePlaceholder')}
          autoComplete="off"
          autoFocus
          onFocus={(e) => e.target.select()}
        />
        <p className="text-xs text-muted-foreground">
          {t('agents.connect.nameHint')}
        </p>
      </div>

      {provider.isAcceptCustomApiUrl && (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">
            {t('agents.connect.apiEndpoint')}
          </label>
          <Input
            {...register('apiUrl')}
            type="url"
            placeholder="https://api.myprovider.com/v1"
            autoComplete="off"
            error={errors.apiUrl?.message}
          />
          <p className="text-xs text-muted-foreground">
            {t('agents.connect.apiEndpointHint')}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">
          {t('agents.connect.apiKey')}{' '}
          {!isApiKeyOptional && <span className="text-destructive">*</span>}
        </label>
        <Input
          {...register('apiKey')}
          type="password"
          placeholder={isApiKeyOptional ? t('agents.connect.optional') : ''}
          autoComplete="new-password"
          error={errors.apiKey?.message}
        />
        <p className="text-xs text-muted-foreground">
          {isApiKeyOptional
            ? t('agents.connect.apiKeyHint')
            : t('agents.connect.apiKeyRequiredHint')}
        </p>
      </div>

      <div className="flex justify-between items-center gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting
            ? t('agents.connect.connecting')
            : t('agents.connect.connect')}
        </Button>
      </div>
    </form>
  );
}
