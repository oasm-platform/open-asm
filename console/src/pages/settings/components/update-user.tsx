import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { authClient } from '@/utils/authClient';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const formSchema = z.object({
  name: z.string().min(1, 'Username is required'),
});

export default function UpdateUser() {
  const { data } = authClient.useSession();

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: data?.user.name ?? '',
    },
  });

  const [loading, setLoading] = useState(false);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setLoading(true);
    try {
      const res = await authClient.updateUser({ ...values, image: '' });
      if (!res.data) {
        form.setError('name', { message: 'Invalid username' });
      } else {
        toast.success('Username updated successfully');
        form.reset({ name: values.name });
      }
    } catch {
      form.setError('name', { message: 'Failed to update username' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Enter your username"
                    {...field}
                    className="w-full"
                    disabled={loading}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            disabled={loading || !form.formState.isDirty}
            type="submit"
            className="w-full"
            size="sm"
          >
            {loading && <Loader2Icon className="w-4 h-4 mr-2 animate-spin" />}
            Update Username
          </Button>
        </form>
      </Form>
    </div>
  );
}
