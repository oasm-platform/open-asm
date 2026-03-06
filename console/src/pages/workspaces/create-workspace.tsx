'use client';

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
import { Loader2Icon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

type FormData = {
  name: string;
  description: string;
};

const CreateWorkspace = () => {
  const navigate = useNavigate();
  const { mutate, isPending } = useWorkspacesControllerCreateWorkspace();
  const { refetch, handleSelectWorkspace } = useWorkspaceSelector();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>();

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
            // Redirect to home page after successful workspace creation
            navigate('/');
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
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending && <Loader2Icon className="animate-spin mr-2" />}
              Create workspace
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreateWorkspace;
