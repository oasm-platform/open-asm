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
import { useInternalNetworksControllerCreateInternalNetwork } from '@/services/apis/gen/queries';
import { Loader2Icon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

type FormData = {
  name: string;
};

const CreateInternalNetwork = () => {
  const navigate = useNavigate();
  const { mutate, isPending } =
    useInternalNetworksControllerCreateInternalNetwork();

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
        },
      },
      {
        onSuccess: () => {
          toast.success('Internal network created successfully');
          navigate('/internal-networks');
          reset();
        },
        onError: () => {
          toast.error('Failed to create internal network');
        },
      },
    );
  };

  const handleCancel = () => {
    navigate('/internal-networks');
  };

  return (
    <div className="h-[50vh] w-full flex flex-col justify-center items-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create Internal Network</CardTitle>
          <CardDescription>
            Create a new internal network for your workspace.
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
                  required: 'Network name is required',
                })}
                autoFocus
                placeholder="Network Name"
              />
              {errors.name && (
                <p className="text-red-600 text-sm mt-1">
                  {errors.name.message}
                </p>
              )}
            </div>
            <div className="flex gap-2 justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2Icon className="animate-spin mr-2" />}
                Create
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreateInternalNetwork;
