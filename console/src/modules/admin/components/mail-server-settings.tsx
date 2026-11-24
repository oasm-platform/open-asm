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
import { type TFunction, useT } from '@/lib/i18n-dictionary';

interface Preset {
  label: string;
  host?: string;
  port?: number;
  secure?: boolean;
  /** Fixed username the service expects; otherwise the admin types one. Labels and hint are dictionary keys. */
  username?: string;
  usernameLabel?: string;
  passwordLabel: string;
  hint?: string;
}

/** SMTP settings of common mail services; all of them send over SMTP */
const PRESETS: Record<MailProvider, Preset> = {
  smtp: { label: 'Custom SMTP', passwordLabel: 'admin.mailServer.label.password' },
  resend: {
    label: 'Resend',
    host: 'smtp.resend.com',
    port: 465,
    secure: true,
    username: 'resend',
    passwordLabel: 'admin.mailServer.label.apiKey',
  },
  sendgrid: {
    label: 'SendGrid',
    host: 'smtp.sendgrid.net',
    port: 587,
    secure: false,
    username: 'apikey',
    passwordLabel: 'admin.mailServer.label.apiKey',
  },
  postmark: {
    label: 'Postmark',
    host: 'smtp.postmarkapp.com',
    port: 587,
    secure: false,
    usernameLabel: 'admin.mailServer.label.serverApiToken',
    passwordLabel: 'admin.mailServer.label.serverApiToken',
  },
  mailgun: {
    label: 'Mailgun',
    host: 'smtp.mailgun.org',
    port: 587,
    secure: false,
    usernameLabel: 'admin.mailServer.label.smtpLogin',
    passwordLabel: 'admin.mailServer.label.smtpPassword',
    hint: 'admin.mailServer.hint.mailgun',
  },
  ses: {
    label: 'Amazon SES',
    host: 'email-smtp.us-east-1.amazonaws.com',
    port: 587,
    secure: false,
    usernameLabel: 'admin.mailServer.label.smtpUsername',
    passwordLabel: 'admin.mailServer.label.smtpPassword',
    hint: 'admin.mailServer.hint.ses',
  },
  brevo: {
    label: 'Brevo',
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    usernameLabel: 'admin.mailServer.label.smtpLogin',
    passwordLabel: 'admin.mailServer.label.smtpKey',
  },
  gmail: {
    label: 'Gmail / Google Workspace',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    usernameLabel: 'admin.mailServer.label.gmailAddress',
    passwordLabel: 'admin.mailServer.label.appPassword',
    hint: 'admin.mailServer.hint.gmail',
  },
};

const createMailServerSchema = (t: TFunction) =>
  z
  .object({
    enabled: z.boolean(),
    provider: z.nativeEnum(MailProvider),
    host: z.string().trim().max(255),
    port: z
      .string()
      .trim()
      .regex(/^\d+$/, t('admin.mailServer.error.portNumber'))
      .refine((port) => +port >= 1 && +port <= 65535, t('admin.mailServer.error.portRange')),
    secure: z.boolean(),
    username: z.string().trim().max(255),
    password: z.string().max(1024),
    fromEmail: z.union([
      z.literal(''),
      z.string().trim().email(t('admin.mailServer.error.invalidEmail')),
    ]),
    fromName: z.string().trim().max(100),
  })
  .superRefine((values, ctx) => {
    if (!values.enabled) return;
    const message = t('admin.mailServer.error.requiredWhenOn');
    if (!values.host) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['host'], message });
    }
    if (!values.fromEmail) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fromEmail'], message });
    }
  });

type MailServerFormValues = z.infer<
  ReturnType<typeof createMailServerSchema>
>;

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
  const t = useT();
  const mailServerSchema = useMemo(() => createMailServerSchema(t), [t]);
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
          toast.success(t('admin.mailServer.saved'));
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
          toast.error(errorMessage(error, t('admin.mailServer.saveFailed')));
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
              <CardTitle>{t('admin.mailServer.title')}</CardTitle>
              <CardDescription>
                {t('admin.mailServer.cardDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <FormField
                control={form.control}
                name="enabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <FormLabel>{t('admin.mailServer.enable')}</FormLabel>
                      <FormDescription>
                        {t('admin.mailServer.enableHint')}
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
                    <FormLabel>{t('admin.mailServer.provider')}</FormLabel>
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
                            {provider === MailProvider.smtp
                              ? t('admin.mailServer.customSmtp')
                              : PRESETS[provider].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {t('admin.mailServer.providerHint')}
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
                      <FormLabel>{t('admin.mailServer.host')}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="smtp.example.com"
                          disabled={isPending}
                          {...field}
                        />
                      </FormControl>
                      {preset.hint && (
                        <FormDescription>{t(preset.hint)}</FormDescription>
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
                      <FormLabel>{t('admin.mailServer.port')}</FormLabel>
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
                      <FormLabel>{t('admin.mailServer.implicitTls')}</FormLabel>
                      <FormDescription>
                        {t('admin.mailServer.implicitTlsHint')}
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
                      <FormLabel>
                        {preset.usernameLabel
                          ? t(preset.usernameLabel)
                          : t('admin.mailServer.username')}
                      </FormLabel>
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
                      <FormLabel>{t(preset.passwordLabel)}</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          autoComplete="new-password"
                          placeholder={
                            server?.hasPassword
                              ? t('admin.mailServer.passwordSaved')
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
                      <FormLabel>{t('admin.mailServer.senderEmail')}</FormLabel>
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
                      <FormLabel>{t('admin.mailServer.senderName')}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t('admin.mailServer.senderNamePlaceholder')}
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
                {t('admin.mailServer.discard')}
              </Button>
              <Button type="submit" disabled={isPending || !isDirty}>
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('common.save')}
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
  const t = useT();
  const { data: session } = useSession();
  const [to, setTo] = useState<string>();
  const recipient = to ?? session?.user.email ?? '';
  const { mutate, isPending } = useSystemConfigsControllerSendTestMail();

  const sendTest = () =>
    mutate(
      { data: { to: recipient } },
      {
        onSuccess: () => toast.success(t('admin.mailServer.testSent', { recipient })),
        onError: (error) => {
          toast.error(errorMessage(error, t('admin.mailServer.testFailed')));
        },
      },
    );

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>{t('admin.mailServer.testTitle')}</CardTitle>
        <CardDescription>
          {ready
            ? t('admin.mailServer.testReady')
            : t('admin.mailServer.testNotReady')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-64 flex-1 gap-2">
          <Label htmlFor="test-mail-to">{t('admin.mailServer.sendTo')}</Label>
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
          {t('admin.mailServer.sendTest')}
        </Button>
      </CardContent>
    </Card>
  );
}
