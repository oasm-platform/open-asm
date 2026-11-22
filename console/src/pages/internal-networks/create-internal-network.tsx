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
import { t as translate, useT } from '@/lib/i18n-dictionary';
import { useInternalNetworksControllerCreateInternalNetwork } from '@/services/apis/gen/queries';
import { Loader2Icon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';

type FormData = {
  name: string;
};

const CreateInternalNetwork = () => {
  const t = useT();
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
          toast.success(translate('internalNetworks.create.success'));
          navigate({ to: '/internal-networks' });
          reset();
        },
        onError: () => {
          toast.error(translate('internalNetworks.create.failed'));
        },
      },
    );
  };

  const handleCancel = () => {
    navigate({ to: '/internal-networks' });
  };

  return (
    <div className="h-[50vh] w-full flex flex-col justify-center items-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('internalNetworks.create.title')}</CardTitle>
          <CardDescription>
            {t('internalNetworks.create.description')}
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
                  required: t('internalNetworks.create.nameRequired'),
                })}
                autoFocus
                placeholder={t('internalNetworks.create.namePlaceholder')}
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
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2Icon className="animate-spin mr-2" />}
                {t('common.create')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreateInternalNetwork;
