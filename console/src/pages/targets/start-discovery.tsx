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
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const domainRegex = /^(?!:\/\/)([a-zA-Z0-9-_]+\.)+[a-zA-Z]{2,}$/;
const cidr24Regex = /^(\d{1,3}\.){3}\d{1,3}\/24$/;
const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;

const targetTypeColor: Record<string, string> = {
  DOMAIN: 'border-blue-500 text-blue-500',
  CIDR: 'border-green-500 text-green-500',
  IP: 'border-orange-500 text-orange-500',
};

const targetTypeBg: Record<string, string> = {
  DOMAIN: 'bg-blue-500/10',
  CIDR: 'bg-green-500/10',
  IP: 'bg-orange-500/10',
};

const targetTypeButton: Record<string, string> = {
  DOMAIN: 'bg-blue-500 hover:bg-blue-600 text-white',
  CIDR: 'bg-green-500 hover:bg-green-600 text-white',
  IP: 'bg-orange-500 hover:bg-orange-600 text-white',
};

const textareaBorderColor: Record<string, string> = {
  DOMAIN: 'border-blue-500 focus-visible:ring-blue-500',
  CIDR: 'border-green-500 focus-visible:ring-green-500',
  IP: 'border-orange-500 focus-visible:ring-orange-500',
};

type TargetType = 'DOMAIN' | 'CIDR' | 'IP';

type FormValues = {
  value: string;
};

/**
 * Parse newline or comma-separated input into array of trimmed, non-empty strings
 */
const parseTargetsInput = (input: string): string[] => {
  return input
    .split(/[,\n]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
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
    return 'Please enter at least one domain.';
  }

  for (const target of targets) {
    if (!domainRegex.test(target)) {
      return `"${target}" is not a valid domain name.`;
    }
  }

  return true;
};

/**
 * Validate multiple CIDR /24 ranges
 */
const validateCidr = (input: string): string | true => {
  const targets = parseTargetsInput(input);

  if (targets.length === 0) {
    return 'Please enter at least one CIDR range.';
  }

  for (const target of targets) {
    if (!cidr24Regex.test(target)) {
      return `"${target}" is not a valid CIDR /24 range (e.g. 192.168.1.0/24).`;
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
    return 'Please enter at least one IP address.';
  }

  for (const target of targets) {
    if (!ipRegex.test(target)) {
      return `"${target}" is not a valid IP address (e.g. 8.8.8.8).`;
    }
  }

  return true;
};

export default function StartDiscovery() {
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
        message: `Duplicate values detected: ${duplicates.join(', ')}`,
      });
      return;
    }

    // Clear any previous errors
    clearErrors('value');

    // Create unique targets array (deduplicated)
    const uniqueTargets = Array.from(
      new Set(targets.map((t) => t.toLowerCase())),
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
            err?.response?.data?.message || 'Failed to create targets';
          setError('value', {
            type: 'manual',
            message: errorMessage,
          });
        },
        onSuccess: (res: BulkTargetResultDto) => {
          if (res.totalCreated > 0) {
            toast.success(
              `Successfully created ${res.totalCreated} target${res.totalCreated > 1 ? 's' : ''}.`,
            );
            reset();
            queryClient.refetchQueries({
              queryKey: ['targets'],
            });
            navigate(`/targets?page=1&pageSize=100`);
          }

          if (res.totalSkipped > 0) {
            toast.info(
              `${res.totalSkipped} target${res.totalSkipped > 1 ? 's' : ''} skipped (already exist).`,
            );
          }
        },
      },
    );
  }

  return (
    <Page title="Start discovery" isShowButtonGoBack>
      <div className="max-w-4xl mx-auto py-6">
        <div className={`bg-card rounded-lg border ${targetTypeBg[targetType]} p-4`}>
          <div className="mb-6">
            <p className="text-muted-foreground mt-2">
              Enter one or more targets to scan, separated by commas or new
              lines.
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
                    Root domain
                  </span>
                </Label>
                <Label htmlFor="type-ip" className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem
                    value="IP"
                    id="type-ip"
                    className={targetTypeColor.IP}
                  />
                  <span className={`${targetType === 'IP' ? 'font-bold' : 'font-normal'} ${targetTypeColor.IP}`}>
                    IP address
                  </span>
                </Label>
                <Label htmlFor="type-cidr" className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem
                    value="CIDR"
                    id="type-cidr"
                    className={targetTypeColor.CIDR}
                  />
                  <span className={`${targetType === 'CIDR' ? 'font-bold' : 'font-normal'} ${targetTypeColor.CIDR}`}>
                    CIDR /24
                  </span>
                </Label>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Textarea
                id="targets"
                rows={4}
                className={textareaBorderColor[targetType]}
                placeholder={
                  targetType === 'DOMAIN'
                    ? 'e.g. example.com, test.com, demo.org'
                    : targetType === 'IP'
                      ? 'e.g. 8.8.8.8, 1.1.1.1'
                      : 'e.g. 203.0.113.0/24, 198.51.100.0/24'
                }
                autoComplete="off"
                {...register('value', {
                  required: 'At least one target is required.',
                  validate: validateTargets,
                })}
                onPaste={(e) => {
                  e.preventDefault();
                  const pastedText = e.clipboardData?.getData('text') || '';
                  const trimmedText = pastedText.trim();

                  // Parse multiple targets from pasted text (comma or newline separated)
                  const pastedTargets = trimmedText
                    .split(/[,\n]+/)
                    .map((t) => t.trim())
                    .filter((t) => t.length > 0)
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
                onClick={() => navigate('/targets')}
              >
                Cancel
              </Button>
              <Button disabled={isPending} type="submit" className={targetTypeButton[targetType]}>
                {isPending && <Loader2Icon className="animate-spin" />}
                Start Discovery
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Page>
  );
}
