import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  getRootControllerGetMetadataQueryKey,
  getSystemConfigsControllerGetConfigQueryKey,
  useSystemConfigsControllerConfirmLogoUpload,
  useSystemConfigsControllerPresignLogoUpload,
  useSystemConfigsControllerGetConfig,
  useSystemConfigsControllerRemoveLogo,
  useSystemConfigsControllerUpdateConfig,
} from '@/services/apis/gen/queries';
import { uploadToPresignedUrl } from '@/services/storage';
import { resolveClientUrl } from '@/utils/storage-url';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { ImageIcon, Loader2, Trash2, Upload, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const LOGO_MAX_SIZE_BYTES = 5 * 1024 * 1024;
// Mirrors the server allow-list in StorageController.isAllowedImageContentType.
const LOGO_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml';
const DEFAULT_NAME = 'OASM';
const DEFAULT_LOGO = '/logo.png';

const brandSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name too long'),
});

type BrandFormValues = z.infer<typeof brandSchema>;

interface PendingLogo {
  file: File;
  /** data: URL, so there is no object URL to revoke. */
  preview: string;
}

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/**
 * Brand name and logo shown in the sidebar, login screen and browser tab.
 * A picked logo stays local until Save; removing the saved logo is immediate.
 */
export default function BrandNameAndLogoSettings() {
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useSystemConfigsControllerGetConfig();
  const updateConfig = useSystemConfigsControllerUpdateConfig();
  const presignLogo = useSystemConfigsControllerPresignLogoUpload();
  const confirmLogo = useSystemConfigsControllerConfirmLogoUpload();
  const removeLogo = useSystemConfigsControllerRemoveLogo();

  const [pendingLogo, setPendingLogo] = useState<PendingLogo | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<BrandFormValues>({
    resolver: zodResolver(brandSchema),
    defaultValues: { name: '' },
    // Sync from the server, but don't clobber a name the user is editing
    // when the config refetches (e.g. after removing the logo).
    values: useMemo(() => config && { name: config.name ?? '' }, [config]),
    resetOptions: { keepDirtyValues: true },
  });
  const { isDirty, isSubmitting } = form.formState;
  const name = form.watch('name');

  const savedLogo =
    typeof config?.logoPath === 'string'
      ? resolveClientUrl(config.logoPath)
      : undefined;
  const logoPreview = pendingLogo?.preview ?? savedLogo;
  const hasChanges = isDirty || !!pendingLogo;

  const refreshBrand = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: getSystemConfigsControllerGetConfigQueryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: getRootControllerGetMetadataQueryKey(),
      }),
    ]);

  const clearPendingLogo = () => {
    setPendingLogo(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleLogoChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!LOGO_ACCEPT.split(',').includes(file.type)) {
      toast.error('Unsupported file type. Use PNG, JPG, GIF, WEBP or SVG.');
      return clearPendingLogo();
    }
    if (file.size > LOGO_MAX_SIZE_BYTES) {
      toast.error('File size exceeds the 5MB limit');
      return clearPendingLogo();
    }
    try {
      setPendingLogo({ file, preview: await readAsDataUrl(file) });
    } catch {
      toast.error('Could not read the selected file');
      clearPendingLogo();
    }
  };

  const handleRemoveLogo = () =>
    removeLogo.mutate(undefined, {
      onSuccess: async () => {
        await refreshBrand();
        toast.success('Logo removed');
      },
      onError: () => toast.error('Failed to remove logo'),
    });

  const uploadLogo = async (file: File) => {
    // Order is load-bearing: presign -> PUT bytes -> confirm (which activates it).
    const { uploadUrl, key } = await presignLogo.mutateAsync({
      data: { fileName: file.name, contentType: file.type },
    });
    // The signed Content-Type is exactly file.type, so echo it back verbatim.
    await uploadToPresignedUrl(uploadUrl, file, file.type);
    await confirmLogo.mutateAsync({ data: { key } });
  };

  const onSubmit = async ({ name }: BrandFormValues) => {
    try {
      if (pendingLogo) await uploadLogo(pendingLogo.file);
      if (isDirty) await updateConfig.mutateAsync({ data: { name } });
    } catch (error) {
      console.error('Failed to save brand settings:', error);
      toast.error(
        pendingLogo ? 'Failed to upload logo' : 'Failed to save brand name',
      );
      return;
    }
    clearPendingLogo();
    // The saved name becomes the new clean baseline.
    form.reset({ name });
    await refreshBrand();
    toast.success('Brand settings saved');
  };

  const handleDiscard = () => {
    clearPendingLogo();
    form.reset();
  };

  if (isLoading) return <BrandSettingsSkeleton />;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Card className="gap-6">
          <CardContent className="space-y-6">
            <Section
              title="Name"
              description="The platform name, up to 100 characters."
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        placeholder={DEFAULT_NAME}
                        maxLength={100}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Section>

            <Section
              title="Logo"
              description="Square image, PNG, JPG, GIF, WEBP or SVG, up to 5MB."
            >
              <div className="flex items-center gap-4">
                <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed bg-muted/40">
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="Logo preview"
                      className="size-full object-contain p-2"
                    />
                  ) : (
                    <ImageIcon className="size-6 text-muted-foreground" />
                  )}
                </div>

                <div className="flex min-w-0 flex-col gap-2">
                  <input
                    ref={fileInputRef}
                    id="logo-upload"
                    type="file"
                    accept={LOGO_ACCEPT}
                    className="hidden"
                    onChange={handleLogoChange}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isSubmitting}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload />
                      {logoPreview ? 'Change' : 'Upload'}
                    </Button>
                    {pendingLogo ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isSubmitting}
                        onClick={clearPendingLogo}
                      >
                        <X />
                        Discard
                      </Button>
                    ) : (
                      savedLogo && (
                        <ConfirmDialog
                          title="Remove logo"
                          description="The platform will fall back to the default logo. This takes effect immediately."
                          onConfirm={handleRemoveLogo}
                          confirmText="Remove"
                          cancelText="Cancel"
                          trigger={
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              disabled={isSubmitting || removeLogo.isPending}
                            >
                              <Trash2 />
                              Remove
                            </Button>
                          }
                        />
                      )
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {pendingLogo
                      ? `${pendingLogo.file.name} — not saved yet`
                      : savedLogo
                        ? 'Custom logo'
                        : 'Using the default logo'}
                  </p>
                </div>
              </div>
            </Section>

            <Section title="Preview" description="How it looks in the sidebar.">
              <div className="flex h-14 items-center gap-2.5 rounded-lg border bg-sidebar px-3">
                <img
                  src={logoPreview ?? DEFAULT_LOGO}
                  alt=""
                  className="size-[30px] rounded-md object-contain"
                />
                <span className="truncate text-[15px] font-semibold tracking-tight">
                  {name.trim() || DEFAULT_NAME}
                </span>
              </div>
            </Section>
          </CardContent>

          <CardFooter className="justify-end gap-2 border-t pt-6">
            <Button
              type="button"
              variant="ghost"
              disabled={!hasChanges || isSubmitting}
              onClick={handleDiscard}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!hasChanges || isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              {isSubmitting ? 'Saving...' : 'Save changes'}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-[200px_1fr] md:gap-6">
      <div className="space-y-1">
        <h4 className="text-sm font-medium">{title}</h4>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function BrandSettingsSkeleton() {
  return (
    <Card className="gap-6">
      <CardContent className="space-y-6">
        <Skeleton className="h-9 w-full" />
        <div className="flex items-center gap-4">
          <Skeleton className="size-20 rounded-lg" />
          <Skeleton className="h-8 w-28" />
        </div>
        <Skeleton className="h-14 w-full" />
      </CardContent>
    </Card>
  );
}
