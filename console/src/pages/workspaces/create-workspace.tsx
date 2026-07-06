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

type FormData = {
  name: string;
  description: string;
};

const CreateWorkspace = () => {
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
        name: `${session.user.name.charAt(0).toUpperCase() + session.user.name.slice(1)}'s workspace`,
      }));
    }
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
          toast.success('Workspace created successfully');
          refetch().then(() => {
            handleSelectWorkspace(data.id);
            navigate({ to: workspaces.length === 0 ? '/targets/start-discovery' : '/' });
          });
          reset();
        },
        onError: () => {
          toast.error('Failed to create workspace');
        },
      },
    );
  };

  return (
    <div className="h-[50vh] w-full flex flex-col justify-center items-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create a new workspace</CardTitle>
          <CardDescription>
            A workspace helps you organize your targets, assets, and
            vulnerabilities.
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
                  required: 'Workspace name is required',
                })}
                onFocus={(e) => e.target.select()}
                placeholder="Workspace Name"
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
                    message: 'Description must be 120 characters or less',
                  },
                })}
                placeholder="Description (optional)"
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
                  Cancel
                </Button>
              )}
              <Button
                type="submit"
                disabled={isPending}
                className={workspaces.length > 0 ? '' : 'w-full'}
              >
                {isPending && <Loader2Icon className="animate-spin mr-2" />}
                Create workspace
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreateWorkspace;
