import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import {
  useTargetsControllerCreateMultipleTargets,
  type BulkTargetResultDto,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2Icon, Target } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const domainRegex = /^(?!:\/\/)([a-zA-Z0-9-_]+\.)+[a-zA-Z]{2,}$/;

type FormValues = {
  value: string;
};

/**
 * Parse comma-separated input into array of trimmed, non-empty domain strings
 */
const parseTargetsInput = (input: string): string[] => {
  return input
    .split(',')
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

export function CreateTarget() {
  const [open, setOpen] = useState(false);
  const { selectedWorkspace, workspaces } = useWorkspaceSelector();
  const workspaceData = workspaces.find((w) => w.id === selectedWorkspace);
  const isAssetsDiscovery = workspaceData?.isAssetsDiscovery ?? false;
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

  function onSubmit(data: FormValues) {
    if (!selectedWorkspace) return;

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
          targets: uniqueTargets.map((value) => ({ value })),
        },
      },
      {
        onError: () => {
          toast.error('Failed to create targets');
        },
        onSuccess: (res: BulkTargetResultDto) => {
          if (res.totalCreated > 0) {
            navigate(`/targets?page=1&pageSize=100`);
            toast.success(
              `Successfully created ${res.totalCreated} target${res.totalCreated > 1 ? 's' : ''}.`,
            );
            setOpen(false);
            reset();
            queryClient.refetchQueries({
              queryKey: ['targets'],
            });
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

  const title = isAssetsDiscovery ? 'Start discovery' : 'Create target';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Target className="shrink-0" />
          <span>{title}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="w-full md:w-3/4 lg:w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Enter one or more domains to scan, separated by commas.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 mb-3">
            <div className="grid gap-3">
              <Label htmlFor="name-1">Targets</Label>
              <Input
                id="name-1"
                placeholder="e.g. example.com, test.com, demo.org"
                autoComplete="off"
                {...register('value', {
                  required: 'Domain is required.',
                  validate: validateDomains,
                })}
                onPaste={(e) => {
                  e.preventDefault();
                  const pastedText = e.clipboardData?.getData('text') || '';
                  const trimmedText = pastedText.trim();

                  // Parse multiple domains from pasted text (comma or newline separated)
                  const pastedDomains = trimmedText
                    .split(/[,\n]+/)
                    .map((t) => t.trim())
                    .filter((t) => t.length > 0)
                    .map((domain) => {
                      // Extract root domain from URL if needed
                      try {
                        const url = new URL(
                          domain.includes('://') ? domain : `http://${domain}`,
                        );
                        return url.hostname || domain;
                      } catch {
                        return domain;
                      }
                    });

                  // Get current value and merge
                  const currentValue = getValues('value') || '';
                  const currentDomains = currentValue
                    ? parseTargetsInput(currentValue)
                    : [];
                  const allDomains = [...currentDomains, ...pastedDomains];

                  // Remove duplicates
                  const uniqueDomains = Array.from(
                    new Set(allDomains.map((d) => d.toLowerCase())),
                  );

                  setValue('value', uniqueDomains.join(', '));
                }}
              />
              {errors.value && (
                <span className="text-sm text-red-500">
                  {errors.value.message}
                </span>
              )}
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button disabled={isPending} type="submit">
              {isPending && <Loader2Icon className="animate-spin" />}
              Start
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
