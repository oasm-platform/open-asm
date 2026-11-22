import { t, useT } from '@/lib/i18n-dictionary';
import Page from '@/components/common/page';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import {
  useTargetsControllerCreateMultipleTargets,
  type BulkTargetResultDto,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { GitOrgPicker } from './components/git-org-picker';

const domainRegex = /^(?!:\/\/)([a-zA-Z0-9-_]+\.)+[a-zA-Z]{2,}$/;
// /24 (256 IPs) down to /32 — the widest range the API accepts.
const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/(2[4-9]|3[0-2])$/;
const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;

const targetTypeColor: Record<string, string> = {
  DOMAIN: 'border-blue-500 text-blue-500',
  CIDR: 'border-green-500 text-green-500',
  IP: 'border-orange-500 text-orange-500',
  GIT_ORG: 'border-purple-500 text-purple-500',
};

const targetTypeBg: Record<string, string> = {
  DOMAIN: 'bg-blue-500/10',
  CIDR: 'bg-green-500/10',
  IP: 'bg-orange-500/10',
  GIT_ORG: 'bg-purple-500/10',
};

const targetTypeButton: Record<string, string> = {
  DOMAIN: 'bg-blue-500 hover:bg-blue-600 text-white',
  CIDR: 'bg-green-500 hover:bg-green-600 text-white',
  IP: 'bg-orange-500 hover:bg-orange-600 text-white',
  GIT_ORG: 'bg-purple-500 hover:bg-purple-600 text-white',
};

const textareaBorderColor: Record<string, string> = {
  DOMAIN: 'border-blue-500 focus-visible:ring-blue-500',
  CIDR: 'border-green-500 focus-visible:ring-green-500',
  IP: 'border-orange-500 focus-visible:ring-orange-500',
  GIT_ORG: 'border-purple-500 focus-visible:ring-purple-500',
};

type TargetType = 'DOMAIN' | 'CIDR' | 'IP' | 'GIT_ORG';

type FormValues = {
  value: string;
};

/**
 * Parse newline or comma-separated input into array of trimmed, non-empty strings
 */
const parseTargetsInput = (input: string): string[] => {
  return input
    .split(/[,\n]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

/**
 * Find duplicate values in array (case-insensitive)
 * Returns array of duplicate values in lowercase
 */
const findDuplicates = (values: string[]): string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    const lowerValue = value.toLowerCase();
    if (seen.has(lowerValue)) {
      duplicates.add(lowerValue);
    } else {
      seen.add(lowerValue);
    }
  }

  return Array.from(duplicates);
};

/**
 * Validate multiple domains using the same regex pattern
 */
const validateDomains = (input: string): string | true => {
  const targets = parseTargetsInput(input);

  if (targets.length === 0) {
    return t('targets.start.domainRequired');
  }

  for (const target of targets) {
    if (!domainRegex.test(target)) {
      return t('targets.start.invalidDomain', { target });
    }
  }

  return true;
};

/**
 * Validate multiple CIDR ranges (/24 to /32)
 */
const validateCidr = (input: string): string | true => {
  const targets = parseTargetsInput(input);

  if (targets.length === 0) {
    return t('targets.start.cidrRequired');
  }

  for (const target of targets) {
    if (!cidrRegex.test(target)) {
      return t('targets.start.invalidCidr', { target });
    }
  }

  return true;
};

/**
 * Validate multiple IP addresses
 */
const validateIp = (input: string): string | true => {
  const targets = parseTargetsInput(input);

  if (targets.length === 0) {
    return t('targets.start.ipRequired');
  }

  for (const target of targets) {
    if (!ipRegex.test(target)) {
      return t('targets.start.invalidIp', { target });
    }
  }

  return true;
};

export default function StartDiscovery() {
  const t = useT();
  const [targetType, setTargetType] = useState<TargetType>('DOMAIN');
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    getValues,
    setError,
    clearErrors,
  } = useForm<FormValues>();
  const queryClient = useQueryClient();
  const { mutate, isPending } = useTargetsControllerCreateMultipleTargets();
  const navigate = useNavigate();

  const validateTargets = (input: string): string | true => {
    if (targetType === 'CIDR') {
      return validateCidr(input);
    }
    if (targetType === 'IP') {
      return validateIp(input);
    }
    return validateDomains(input);
  };

  function onSubmit(data: FormValues) {
    const targets = parseTargetsInput(data.value);
    const duplicates = findDuplicates(targets);

    if (duplicates.length > 0) {
      setError('value', {
        type: 'manual',
        message: t('targets.start.duplicates', { values: duplicates.join(', ') }),
      });
      return;
    }

    // Clear any previous errors
    clearErrors('value');

    // Create unique targets array (deduplicated)
    const uniqueTargets = Array.from(
      new Set(targets.map((item) => item.toLowerCase())),
    );

    mutate(
      {
        data: {
          targets: uniqueTargets.map((value) => ({ value, type: targetType })),
        },
      },
      {
        onError: (error: unknown) => {
          const err = error as {
            response?: { data?: { message?: string } };
          };
          const errorMessage =
            err?.response?.data?.message || t('targets.start.createFailed');
          setError('value', {
            type: 'manual',
            message: errorMessage,
          });
        },
        onSuccess: (res: BulkTargetResultDto) => {
          if (res.totalCreated > 0) {
            toast.success(
              t('targets.start.created', { count: res.totalCreated }),
            );
            reset();
            queryClient.refetchQueries({
              queryKey: ['targets'],
            });
            navigate({ to: '/targets', search: { page: 1, pageSize: 100 } });
          }

          if (res.totalSkipped > 0) {
            toast.info(
              t('targets.start.skipped', { count: res.totalSkipped }),
            );
          }
        },
      },
    );
  }

  return (
    <Page
      title={t('targets.start.title')}
      description={t('targets.start.description')}
      headerClassName="mx-auto w-full max-w-4xl"
      permission="target.write"
    >
      <div className="max-w-4xl mx-auto pb-6">
        <div className={`bg-card rounded-lg border ${targetTypeBg[targetType]} p-4`}>
          <div className="mb-6">
            <p className="text-muted-foreground mt-2">
              {targetType === 'GIT_ORG'
                ? t('targets.start.gitOrgHint')
                : t('targets.start.hint')}
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <RadioGroup
                value={targetType}
                onValueChange={(val) => {
                  setTargetType(val as TargetType);
                  setValue('value', '');
                  clearErrors('value');
                }}
                className="flex flex-col sm:flex-row gap-4 sm:gap-6"
              >
                <Label htmlFor="type-domain" className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem
                    value="DOMAIN"
                    id="type-domain"
                    className={targetTypeColor.DOMAIN}
                  />
                  <span className={`${targetType === 'DOMAIN' ? 'font-bold' : 'font-normal'} ${targetTypeColor.DOMAIN}`}>
                    {t('targets.start.types.domain')}
                  </span>
                </Label>
                <Label htmlFor="type-ip" className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem
                    value="IP"
                    id="type-ip"
                    className={targetTypeColor.IP}
                  />
                  <span className={`${targetType === 'IP' ? 'font-bold' : 'font-normal'} ${targetTypeColor.IP}`}>
                    {t('targets.start.types.ip')}
                  </span>
                </Label>
                <Label htmlFor="type-cidr" className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem
                    value="CIDR"
                    id="type-cidr"
                    className={targetTypeColor.CIDR}
                  />
                  <span className={`${targetType === 'CIDR' ? 'font-bold' : 'font-normal'} ${targetTypeColor.CIDR}`}>
                    {t('targets.start.types.cidr')}
                  </span>
                </Label>
                <Label htmlFor="type-git-org" className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem
                    value="GIT_ORG"
                    id="type-git-org"
                    className={targetTypeColor.GIT_ORG}
                  />
                  <span className={`${targetType === 'GIT_ORG' ? 'font-bold' : 'font-normal'} ${targetTypeColor.GIT_ORG}`}>
                    {t('targets.start.types.gitOrg')}
                  </span>
                </Label>
              </RadioGroup>
            </div>

            {targetType === 'GIT_ORG' ? (
              <GitOrgPicker />
            ) : (
            <>
            <div className="space-y-2">
              <Textarea
                id="targets"
                rows={4}
                className={textareaBorderColor[targetType]}
                placeholder={
                  targetType === 'DOMAIN'
                    ? t('targets.start.placeholder.domain')
                    : targetType === 'IP'
                      ? t('targets.start.placeholder.ip')
                      : t('targets.start.placeholder.cidr')
                }
                autoComplete="off"
                {...register('value', {
                  required: t('targets.start.required'),
                  validate: validateTargets,
                })}
                onPaste={(e) => {
                  e.preventDefault();
                  const pastedText = e.clipboardData?.getData('text') || '';
                  const trimmedText = pastedText.trim();

                  // Parse multiple targets from pasted text (comma or newline separated)
                  const pastedTargets = trimmedText
                    .split(/[,\n]+/)
                    .map((item) => item.trim())
                    .filter((item) => item.length > 0)
                    .map((target) => {
                      if (targetType === 'CIDR' || targetType === 'IP') {
                        return target;
                      }
                      // Extract root domain from URL if needed
                      try {
                        const url = new URL(
                          target.includes('://') ? target : `http://${target}`,
                        );
                        return url.hostname || target;
                      } catch {
                        return target;
                      }
                    });

                  // Get current value and merge
                  const currentValue = getValues('value') || '';
                  const currentTargets = currentValue
                    ? parseTargetsInput(currentValue)
                    : [];
                  const allTargets = [...currentTargets, ...pastedTargets];

                  // Remove duplicates
                  const uniqueTargets = Array.from(
                    new Set(allTargets.map((d) => d.toLowerCase())),
                  );

                  setValue('value', uniqueTargets.join('\n'));
                }}
              />
              {errors.value && (
                <span className="text-sm text-red-500">
                  {errors.value.message}
                </span>
              )}
            </div>

            <div className="pt-4 flex justify-between">
              <Button
                variant="outline"
                type="button"
                onClick={() => navigate({ to: '/targets' })}
              >
                {t('common.cancel')}
              </Button>
              <Button disabled={isPending} type="submit" className={targetTypeButton[targetType]}>
                {isPending && <Loader2Icon className="animate-spin" />}
                {t('targets.start.submit')}
              </Button>
            </div>
            </>
            )}
          </form>
        </div>
      </div>
    </Page>
  );
}
