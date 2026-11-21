'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { useWorkspacesControllerCreateWorkspace } from '@/services/apis/gen/queries';
import { useSession } from '@/utils/authClient';
import { Loader2Icon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useT } from '@/lib/i18n-dictionary';

type FormData = {
  name: string;
  description: string;
};

const CreateWorkspace = () => {
  const t = useT();
  const navigate = useNavigate();
  const { mutate, isPending } = useWorkspacesControllerCreateWorkspace();
  const { workspaces, isLoading: isWorkspacesLoading, refetch, handleSelectWorkspace } =
    useWorkspaceSelector();
  const { data: session } = useSession();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>();

  useEffect(() => {
    if (!isWorkspacesLoading && workspaces.length === 0 && session?.user?.name) {
      reset((formValues) => ({
        ...formValues,
        name: t('workspaces.create.defaultName', {
          name: session.user.name.charAt(0).toUpperCase() + session.user.name.slice(1),
        }),
      }));
    }
    // No `t` in deps: a language switch must not overwrite a typed name.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWorkspacesLoading, workspaces.length, session?.user?.name, reset]);

  const onSubmit = (data: FormData) => {
    mutate(
      {
        data: {
          name: data.name,
          description: data.description,
        },
      },
      {
        onSuccess: (data) => {
          toast.success(t('workspaces.create.success'));
          refetch().then(() => {
            handleSelectWorkspace(data.id);
            navigate({ to: workspaces.length === 0 ? '/targets/start-discovery' : '/' });
          });
          reset();
        },
        onError: () => {
          toast.error(t('workspaces.create.failed'));
        },
      },
    );
  };

  return (
    <div className="h-[50vh] w-full flex flex-col justify-center items-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('workspaces.create.title')}</CardTitle>
          <CardDescription>
            {t('workspaces.create.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={handleSubmit(onSubmit)}
          >
            <div>
              <Input
                {...register('name', {
                  required: t('workspaces.create.nameRequired'),
                })}
                onFocus={(e) => e.target.select()}
                placeholder={t('workspaces.create.namePlaceholder')}
              />
              {errors.name && (
                <p className="text-red-600 text-sm mt-1">
                  {errors.name.message}
                </p>
              )}
            </div>
            <div>
              <Textarea
                {...register('description', {
                  maxLength: {
                    value: 120,
                    message: t('workspaces.create.descriptionMax'),
                  },
                })}
                placeholder={t('workspaces.create.descriptionPlaceholder')}
                className="h-32"
                rows={8}
              />
              {errors.description && (
                <p className="text-red-600 text-sm mt-1">
                  {errors.description.message}
                </p>
              )}
            </div>
            <div className={`flex gap-2 ${workspaces.length > 0 ? 'justify-between' : ''}`}>
              {workspaces.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate({ to: '/' })}
                >
                  {t('common.cancel')}
                </Button>
              )}
              <Button
                type="submit"
                disabled={isPending}
                className={workspaces.length > 0 ? '' : 'w-full'}
              >
                {isPending && <Loader2Icon className="animate-spin mr-2" />}
                {t('workspaces.create.submit')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreateWorkspace;
