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
import { useTargetsControllerCreateTarget } from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2Icon, Target } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import psl from 'psl';

const domainRegex = /^(?!:\/\/)([a-zA-Z0-9-_]+\.)+[a-zA-Z]{2,}$/;

type FormValues = {
  value: string;
};

function getRootDomain(domainOrUrl: string): string {
  try {
    let urlString = domainOrUrl.trim();
    if (!urlString.match(/^[a-zA-Z]+:\/\//)) {
      urlString = `http://${urlString}`;
    }

    const hostname = new URL(urlString).hostname;
    const parsed = psl.parse(hostname);

    if (parsed.error) {
      return hostname;
    }

    return parsed.domain || hostname;
  } catch {
    return domainOrUrl.trim();
  }
}

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
  } = useForm<FormValues>();
  const queryClient = useQueryClient();
  const { mutate, isPending } = useTargetsControllerCreateTarget();
  const navigate = useNavigate();
  function onSubmit(data: FormValues) {
    if (selectedWorkspace)
      mutate(
        {
          data: {
            value: data.value,
            workspaceId: selectedWorkspace,
          },
        },
        {
          onError: () => {
            toast.error('Failed to create target');
          },
          onSuccess: (res) => {
            navigate(`/targets/${res.id}?animation=true&page=1&pageSize=100`);
            toast.success('Target created successfully');
            setOpen(false);
            reset();
            queryClient.refetchQueries({
              queryKey: ['targets', res.id],
            });
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
          <span className="hidden lg:inline">{title}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="w-full md:w-3/4 lg:w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Enter the domain you want to scan.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 mb-3">
            <div className="grid gap-3">
              <Label htmlFor="name-1">Target</Label>
              <Input
                id="name-1"
                placeholder="e.g. example.com"
                autoComplete="off"
                {...register('value', {
                  required: 'Domain is required.',
                  validate: (value) =>
                    domainRegex.test(value.trim()) ||
                    'Please enter a valid domain name (no IP addresses).',
                })}
                onPaste={(e) => {
                  e.preventDefault();
                  const pastedText = e.clipboardData?.getData('text') || '';
                  const rootDomain = getRootDomain(pastedText);
                  setValue('value', rootDomain);
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
