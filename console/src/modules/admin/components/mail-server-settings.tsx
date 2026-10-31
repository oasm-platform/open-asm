import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  getRootControllerGetMetadataQueryKey,
  getSystemConfigsControllerGetSettingsQueryKey,
  MailProvider,
  useSystemConfigsControllerGetSettings,
  useSystemConfigsControllerSendTestMail,
  useSystemConfigsControllerUpdateSettings,
  type MailServerSettingsDto,
} from '@/services/apis/gen/queries';
import { useSession } from '@/utils/authClient';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { Loader2, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

interface Preset {
  label: string;
  host?: string;
  port?: number;
  secure?: boolean;
  /** Fixed username the service expects; otherwise the admin types one */
  username?: string;
  usernameLabel?: string;
  passwordLabel: string;
  hint?: string;
}

/** SMTP settings of common mail services; all of them send over SMTP */
const PRESETS: Record<MailProvider, Preset> = {
  smtp: { label: 'Custom SMTP', passwordLabel: 'Password' },
  resend: {
    label: 'Resend',
    host: 'smtp.resend.com',
    port: 465,
    secure: true,
    username: 'resend',
    passwordLabel: 'API key',
  },
  sendgrid: {
    label: 'SendGrid',
    host: 'smtp.sendgrid.net',
    port: 587,
    secure: false,
    username: 'apikey',
    passwordLabel: 'API key',
  },
  postmark: {
    label: 'Postmark',
    host: 'smtp.postmarkapp.com',
    port: 587,
    secure: false,
    usernameLabel: 'Server API token',
    passwordLabel: 'Server API token',
  },
  mailgun: {
    label: 'Mailgun',
    host: 'smtp.mailgun.org',
    port: 587,
    secure: false,
    usernameLabel: 'SMTP login',
    passwordLabel: 'SMTP password',
    hint: 'Use smtp.eu.mailgun.org for domains in the EU region.',
  },
  ses: {
    label: 'Amazon SES',
    host: 'email-smtp.us-east-1.amazonaws.com',
    port: 587,
    secure: false,
    usernameLabel: 'SMTP username',
    passwordLabel: 'SMTP password',
    hint: 'Change the region in the host to match your SES region.',
  },
  brevo: {
    label: 'Brevo',
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    usernameLabel: 'SMTP login',
    passwordLabel: 'SMTP key',
  },
  gmail: {
    label: 'Gmail / Google Workspace',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    usernameLabel: 'Gmail address',
    passwordLabel: 'App password',
    hint: 'Needs 2-Step Verification and an app password.',
  },
};

const mailServerSchema = z
  .object({
    enabled: z.boolean(),
    provider: z.nativeEnum(MailProvider),
    host: z.string().trim().max(255),
    port: z
      .string()
      .trim()
      .regex(/^\d+$/, 'Enter a port number')
      .refine((port) => +port >= 1 && +port <= 65535, 'Port must be 1–65535'),
    secure: z.boolean(),
    username: z.string().trim().max(255),
    password: z.string().max(1024),
    fromEmail: z.union([
      z.literal(''),
      z.string().trim().email('Invalid email address'),
    ]),
    fromName: z.string().trim().max(100),
  })
  .superRefine((values, ctx) => {
    if (!values.enabled) return;
    const message = 'Required to turn on the mail server';
    if (!values.host) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['host'], message });
    }
    if (!values.fromEmail) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fromEmail'], message });
    }
  });

type MailServerFormValues = z.infer<typeof mailServerSchema>;

const toFormValues = (
  server?: MailServerSettingsDto,
): MailServerFormValues => ({
  enabled: server?.enabled ?? false,
  provider: server?.provider ?? MailProvider.smtp,
  host: server?.host ?? '',
  port: String(server?.port ?? 587),
  secure: server?.secure ?? false,
  username: server?.username ?? '',
  password: '',
  fromEmail: server?.fromEmail ?? '',
  fromName: server?.fromName ?? '',
});

const errorMessage = (error: unknown, fallback: string) =>
  (error as AxiosError<{ message?: string }>).response?.data?.message ??
  fallback;

/**
 * Outgoing mail server (`settings.mailServer`). Sign-up needs it on: new
 * accounts confirm their email through it.
 */
export default function MailServerSettings() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useSystemConfigsControllerGetSettings();
  const server = settings?.mailServer;
  const { mutate, isPending } = useSystemConfigsControllerUpdateSettings();

  const form = useForm<MailServerFormValues>({
    resolver: zodResolver(mailServerSchema),
    defaultValues: toFormValues(),
    // Sync from the server without clobbering fields being edited
    values: useMemo(() => server && toFormValues(server), [server]),
    resetOptions: { keepDirtyValues: true },
  });
  const { isDirty } = form.formState;
  const preset = PRESETS[form.watch('provider')];

  const applyPreset = (provider: MailProvider) => {
    const { host, port, secure, username } = PRESETS[provider];
    const dirty = { shouldDirty: true };
    form.setValue('provider', provider, dirty);
    if (host !== undefined) form.setValue('host', host, dirty);
    if (port !== undefined) form.setValue('port', String(port), dirty);
    if (secure !== undefined) form.setValue('secure', secure, dirty);
    form.setValue('username', username ?? '', dirty);
  };

  const onSubmit = (values: MailServerFormValues) =>
    mutate(
      {
        data: {
          mailServer: {
            ...values,
            port: Number(values.port),
            // Empty keeps the saved password
            password: values.password || undefined,
          },
        },
      },
      {
        onSuccess: () => {
          toast.success('Mail server saved.');
          form.reset({ ...values, password: '' });
          return Promise.all([
            queryClient.invalidateQueries({
              queryKey: getSystemConfigsControllerGetSettingsQueryKey(),
            }),
            // Metadata's `allowSignUp` needs the mail server on
            queryClient.invalidateQueries({
              queryKey: getRootControllerGetMetadataQueryKey(),
            }),
          ]);
        },
        onError: (error) => {
          toast.error(errorMessage(error, 'Failed to save the mail server.'));
        },
      },
    );

  if (isLoading) {
    return <Skeleton className="h-[520px] w-full rounded-xl" />;
  }

  return (
    <div className="space-y-4">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Card className="gap-6">
            <CardHeader>
              <CardTitle>Mail server</CardTitle>
              <CardDescription>
                Sends verification emails to new accounts. Sign-up stays closed
                while it is off.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <FormField
                control={form.control}
                name="enabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <FormLabel>Turn on mail server</FormLabel>
                      <FormDescription>
                        Takes effect when you save.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isPending}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="provider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provider</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) =>
                        applyPreset(value as MailProvider)
                      }
                      disabled={isPending}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.values(MailProvider).map((provider) => (
                          <SelectItem key={provider} value={provider}>
                            {PRESETS[provider].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Fills in the server settings; every provider is used over
                      SMTP.
                    </FormDescription>
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="host"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Host</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="smtp.example.com"
                          disabled={isPending}
                          {...field}
                        />
                      </FormControl>
                      {preset.hint && (
                        <FormDescription>{preset.hint}</FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="port"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Port</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="numeric"
                          disabled={isPending}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="secure"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <FormLabel>Implicit TLS</FormLabel>
                      <FormDescription>
                        Usually port 465. Off uses STARTTLS, usually port 587.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isPending}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{preset.usernameLabel ?? 'Username'}</FormLabel>
                      <FormControl>
                        <Input
                          autoComplete="off"
                          disabled={isPending}
                          {...field}
                        />
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
                      <FormLabel>{preset.passwordLabel}</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          autoComplete="new-password"
                          placeholder={
                            server?.hasPassword
                              ? 'Saved; leave empty to keep it'
                              : undefined
                          }
                          disabled={isPending}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="fromEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sender email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="no-reply@example.com"
                          disabled={isPending}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fromName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sender name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Defaults to the system name"
                          disabled={isPending}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
            <CardFooter className="justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => form.reset(toFormValues(server))}
                disabled={isPending || !isDirty}
              >
                Discard
              </Button>
              <Button type="submit" disabled={isPending || !isDirty}>
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
      <TestMailCard ready={!!server?.enabled && !isDirty} />
    </div>
  );
}

/** Sends a test email through the saved settings */
function TestMailCard({ ready }: { ready: boolean }) {
  const { data: session } = useSession();
  const [to, setTo] = useState<string>();
  const recipient = to ?? session?.user.email ?? '';
  const { mutate, isPending } = useSystemConfigsControllerSendTestMail();

  const sendTest = () =>
    mutate(
      { data: { to: recipient } },
      {
        onSuccess: () => toast.success(`Test email sent to ${recipient}.`),
        onError: (error) => {
          toast.error(errorMessage(error, 'Failed to send the test email.'));
        },
      },
    );

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Send a test email</CardTitle>
        <CardDescription>
          {ready
            ? 'Check that the saved settings work.'
            : 'Save the settings and turn on the mail server first.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-64 flex-1 gap-2">
          <Label htmlFor="test-mail-to">Send to</Label>
          <Input
            id="test-mail-to"
            type="email"
            value={recipient}
            onChange={(event) => setTo(event.target.value)}
            disabled={!ready || isPending}
          />
        </div>
        <Button
          variant="outline"
          className="gap-1.5"
          onClick={sendTest}
          disabled={!ready || !recipient || isPending}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Send test email
        </Button>
      </CardContent>
    </Card>
  );
}
