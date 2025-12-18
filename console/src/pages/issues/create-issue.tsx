import Page from '@/components/common/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  getIssuesControllerGetManyQueryKey,
  useIssuesControllerCreate,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';

interface CreateIssueForm {
  title: string;
  description: string;
}

export default function CreateIssue() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CreateIssueForm>();
  const createIssueMutation = useIssuesControllerCreate();

  const onSubmit = async (data: CreateIssueForm) => {
    try {
      const response = await createIssueMutation.mutateAsync({
        data: {
          title: data.title,
          description: data.description,
          sourceType: 'vulnerability',
          sourceId: '',
        },
      });

      reset();
      await queryClient.invalidateQueries({
        queryKey: getIssuesControllerGetManyQueryKey(),
      });

      // Redirect to the newly created issue detail page
      navigate(`/issues/${response.id}`);
    } catch (error) {
      console.error('Failed to create issue:', error);
    }
  };

  return (
    <Page
      isShowButtonGoBack
      className="w-full xl:w-1/2 mx-auto"
      title={
        <div className="flex flex-col items-start gap-2">
          <div className="flex items-center gap-2">
            <span>Create new issue</span>
          </div>
        </div>
      }
    >
      <div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Input
              {...register('title', { required: 'Title is required' })}
              placeholder="Title"
              disabled={createIssueMutation.isPending}
            />
            {errors.title && (
              <p className="text-sm text-red-500">{errors.title.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Textarea
              {...register('description')}
              placeholder="Description"
              className="h-64"
              rows={10}
              disabled={createIssueMutation.isPending}
            />
          </div>
          <div className="pt-4 flex justify-end">
            <Button type="submit" disabled={createIssueMutation.isPending}>
              {createIssueMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </form>
      </div>
    </Page>
  );
}
