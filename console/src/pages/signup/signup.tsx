import AuthLayout from '@/components/common/layout/auth-layout';
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
import {
  getRootControllerGetMetadataQueryKey,
  useRootControllerGetMetadata,
} from '@/services/apis/gen/queries';
import { authClient } from '@/utils/authClient';
import { verificationCallbackURL } from '@/utils/verification-url';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Loader2Icon, UserX } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const formSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(100, 'Name too long'),
    email: z.string().email('Invalid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must be at most 128 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

/**
 * Public sign-up. The route loads fresh metadata before this renders, so the
 * form only shows while an admin allows sign-up (`allowSignUp`); otherwise the
 * page says so instead. A new account waits for an admin to approve it, so
 * sign-up always ends on /login, never signed in.
 */
export default function SignUp() {
  const { redirect } = useSearch({ strict: false });
  const { data: metadata, isError } = useRootControllerGetMetadata();

  return (
    <AuthLayout>
      <div className="flex w-full items-center justify-center bg-background px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-sm space-y-8">
          {metadata?.allowSignUp ? (
            <SignUpForm redirect={redirect} />
          ) : metadata ? (
            <SignUpNotice
              title="Sign-up is turned off"
              description="New accounts can't be created right now. Contact your administrator to get an account."
              redirect={redirect}
            />
          ) : isError ? (
            <SignUpNotice
              title="Sign-up is unavailable"
              description="Unable to reach the server. Please try again later."
              redirect={redirect}
            />
          ) : (
            <Loader2Icon
              aria-label="Loading"
              className="mx-auto size-6 animate-spin text-muted-foreground"
            />
          )}
        </div>
      </div>
    </AuthLayout>
  );
}

function SignUpNotice({
  title,
  description,
  redirect,
}: {
  title: string;
  description: string;
  redirect?: string;
}) {
  return (
    <div className="space-y-6 text-center lg:text-left">
      <UserX className="mx-auto size-10 text-muted-foreground lg:mx-0" />
      <div className="space-y-2">
        <h1 className="text-balance text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        <p className="text-pretty text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      <Button asChild className="w-full">
        <Link to="/login" search={{ redirect }}>
          Back to sign in
        </Link>
      </Button>
    </div>
  );
}

function SignUpForm({ redirect }: { redirect?: string }) {
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setLoading(true);
    try {
      // The account is created inactive and gets no session; the API answers
      // a taken email the same way, so the page never tells them apart.
      const res = await authClient.signUp.email({
        name: values.name,
        email: values.email,
        password: values.password,
        callbackURL: verificationCallbackURL(redirect),
      });
      setLoading(false);
      if (!res.error) {
        // The toast outlives the page change. `redirect` rides along, so the
        // first sign-in after approval still lands where they started.
        toast.success('Account created', {
          description:
            'Check your inbox to confirm your email. An administrator then approves your account.',
        });
        await navigate({ to: '/login', search: { redirect }, replace: true });
      } else if (res.error.status === 403) {
        // Closed after this page loaded: the refetch swaps the form for the
        // turned-off notice.
        void queryClient.invalidateQueries({
          queryKey: getRootControllerGetMetadataQueryKey(),
        });
      } else {
        toast.error(
          res.error.message || 'Something went wrong. Please try again later.',
          { richColors: true },
        );
      }
    } catch {
      setLoading(false);
      toast.error('Unable to reach the server. Please try again later.', {
        richColors: true,
      });
    }
  }

  return (
    <>
      <div className="space-y-2 text-center lg:text-left">
        <h1 className="text-balance text-2xl font-semibold tracking-tight">
          Create an account
        </h1>
        <p className="text-pretty text-sm text-muted-foreground">
          Sign up to get started.
        </p>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder="Your name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input placeholder="email@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="••••••••" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm password</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="••••••••" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button disabled={loading} type="submit" className="w-full">
            {loading && <Loader2Icon className="animate-spin" />}
            Create account
          </Button>
        </form>
      </Form>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link
          to="/login"
          search={{ redirect }}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
