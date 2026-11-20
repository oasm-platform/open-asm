import AuthLayout from '@/components/common/layout/auth-layout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { getWorkspaceListQueryOptions } from '@/hooks/useWorkspaceSelector';
import { useRootControllerGetMetadata } from '@/services/apis/gen/queries';
import { authClient } from '@/utils/authClient';
import { safeRedirectPath } from '@/utils/safe-redirect';
import { verificationCallbackURL } from '@/utils/verification-url';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useRouter, useSearch } from '@tanstack/react-router';
import { Loader2Icon, MailCheck, MailWarning } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useT, type TFunction } from '@/lib/i18n-dictionary';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const makeFormSchema = (t: TFunction) =>
  z.object({
    email: z.string().email(t('auth.errors.invalidEmail')),
    password: z.string().min(8, t('auth.errors.passwordMin')),
  });
type FormValues = z.infer<ReturnType<typeof makeFormSchema>>;

export default function Login() {
  const t = useT();
  const formSchema = useMemo(() => makeFormSchema(t), [t]);
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const [loading, setLoading] = useState(false);
  // Set when the account still has to confirm its email
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const queryClient = useQueryClient();
  const router = useRouter();
  const {
    redirect,
    verified,
    error: verificationError,
  } = useSearch({ strict: false });
  // Refetched on mount, so an admin's toggle shows on the next visit
  const { data: metadata } = useRootControllerGetMetadata();

  // Warm the post-login route chunks (JS + CSS) while the user is typing, so
  // a cold cache on a slow network doesn't leave them stuck here after a
  // successful sign-in. Only the code is fetched — preloadRoute() would run
  // _authed.beforeLoad, which bounces to /login without a session.
  useEffect(() => {
    const target = safeRedirectPath(redirect).split(/[?#]/)[0];
    for (const route of router.getMatchedRoutes(target).matchedRoutes) {
      router.loadRouteChunk(route)?.catch(() => {
        // Best effort — the real navigation retries the chunk.
      });
    }
  }, [router, redirect]);

  async function onSubmit(values: FormValues) {
    setLoading(true);
    try {
      // Don't navigate on success — session hasn't propagated to
      // RouterProvider context yet. Let AppRouter's effect call
      // router.invalidate() after useSession() updates, which
      // re-runs login.tsx:beforeLoad and redirects to '/'.
      // Loading stays on until that redirect unmounts this page: on a cold
      // cache the target route's lazy chunks can take a while to arrive.
      const res = await authClient.signIn.email({
        email: values.email,
        password: values.password,
      });
      if (!res.error) {
        // The session reaches the router one get-session round trip later;
        // fetch the workspace list the authed layout waits on meanwhile.
        void queryClient.prefetchQuery(getWorkspaceListQueryOptions());
      } else {
        setLoading(false);
        setUnverifiedEmail(
          res.error.code === 'EMAIL_NOT_VERIFIED' ? values.email : null,
        );
        // 401/403 mean the credentials were rejected — show it on the
        // field. Anything else (5xx, gateway errors) is a server problem.
        if (res.error.status === 401 || res.error.status === 403) {
          form.setError('password', {
            message: res.error.message || t('auth.errors.invalidCredentials'),
          });
        } else {
          toast.error(
            res.error.message || t('auth.errors.generic'),
            { richColors: true },
          );
        }
      }
    } catch {
      setLoading(false);
      toast.error(t('auth.errors.unreachable'), {
        richColors: true,
      });
    }
  }

  async function resendVerification(email: string) {
    setResending(true);
    const res = await authClient
      .sendVerificationEmail({
        email,
        callbackURL: verificationCallbackURL(redirect),
      })
      .catch(() => null);
    setResending(false);
    if (res && !res.error) {
      toast.success(t('auth.verify.sent'), {
        description: t('auth.verify.sentDescription', { email }),
      });
    } else {
      toast.error(
        res?.error?.message || t('auth.verify.sendFailed'),
        { richColors: true },
      );
    }
  }

  return (
    <AuthLayout>
      <div className="flex w-full items-center justify-center bg-background px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2 text-center lg:text-left">
            <h1 className="text-balance text-2xl font-semibold tracking-tight">
              {t('auth.login.title')}
            </h1>
            <p className="text-pretty text-sm text-muted-foreground">
              {t('auth.login.subtitle')}
            </p>
          </div>
          {verificationError ? (
            <Alert variant="destructive">
              <MailWarning />
              <AlertTitle>{t('auth.verify.linkFailed')}</AlertTitle>
              <AlertDescription>
                {t('auth.verify.linkFailedDescription')}
              </AlertDescription>
            </Alert>
          ) : verified ? (
            <Alert>
              <MailCheck />
              <AlertTitle>{t('auth.verify.confirmed')}</AlertTitle>
              <AlertDescription>
                {t('auth.verify.confirmedDescription')}
              </AlertDescription>
            </Alert>
          ) : null}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('auth.fields.email')}</FormLabel>
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
                    <FormLabel>{t('auth.fields.password')}</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                disabled={loading}
                type="submit"
                className="w-full"
              >
                {loading && <Loader2Icon className="animate-spin" />}
                {t('auth.login.submit')}
              </Button>
              {unverifiedEmail && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={resending}
                  onClick={() => void resendVerification(unverifiedEmail)}
                >
                  {resending && <Loader2Icon className="animate-spin" />}
                  {t('auth.verify.resend')}
                </Button>
              )}
            </form>
          </Form>
          {metadata?.allowSignUp && (
            <p className="text-center text-sm text-muted-foreground">
              {t('auth.login.noAccount')}{' '}
              <Link
                to="/signup"
                search={{ redirect }}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {t('auth.login.signUp')}
              </Link>
            </p>
          )}
        </div>
      </div>
    </AuthLayout>
  );
}
