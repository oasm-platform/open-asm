import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  getRootControllerGetMetadataQueryKey,
  useStorageControllerUploadLogo,
  useSystemConfigsControllerGetConfig,
  useSystemConfigsControllerRemoveLogo,
  useSystemConfigsControllerUpdateConfig,
} from '@/services/apis/gen/queries';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import React, { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

// Define validation schema
const systemConfigSchema = z.object({
  name: z.string().min(1, 'System name is required').max(100, 'Name too long'),
});

type SystemConfigFormValues = z.infer<typeof systemConfigSchema>;

/**
 * System Configuration Settings Component
 * Allows administrators to configure system-wide settings including the system name and logo
 */
export default function SystemConfigSettings() {
  const {
    data: config,
    isLoading,
    refetch,
  } = useSystemConfigsControllerGetConfig();
  const { mutate: removeLogoMutate } = useSystemConfigsControllerRemoveLogo();
  const queryClient = useQueryClient();
  const updateConfigMutation = useSystemConfigsControllerUpdateConfig({
    mutation: {
      onSuccess: () => {
        toast.success('System configuration updated successfully');
        // Reset the logo removal flag after successful update
        setShouldRemoveLogo(false);
        refetch();
        queryClient.invalidateQueries({
          queryKey: getRootControllerGetMetadataQueryKey(),
        });
      },
      onError: (error) => {
        console.error('Update error:', error);
        toast.error('Failed to update system configuration');
      },
    },
  });

  // Add upload logo mutation
  const uploadLogoMutation = useStorageControllerUploadLogo({
    mutation: {
      onSuccess: () => {
        toast.success('Logo uploaded successfully');
        refetch(); // Refresh config to get updated logo path
      },
      onError: (error) => {
        console.error('Upload error:', error);
        toast.error('Failed to upload logo');
      },
    },
  });

  const form = useForm<SystemConfigFormValues>({
    resolver: zodResolver(systemConfigSchema),
    defaultValues: {
      name: '',
    },
  });

  // State for logo file and preview
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [shouldRemoveLogo, setShouldRemoveLogo] = useState<boolean>(false); // Track if logo should be removed
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null); // Store preview URL for cleanup

  // Cleanup preview URL on unmount
  React.useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  // Set initial values when config data is loaded
  React.useEffect(() => {
    if (config) {
      form.reset({
        name: config.name || '',
      });

      // Cleanup previous blob URL if exists
      if (previewUrlRef.current && previewUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }

      // Set initial logo preview if logo exists
      // logoPath is a string like "/api/storage/system/logo.png" or null
      if (config.logoPath && typeof config.logoPath === 'string') {
        const fullUrl = `${window.location.origin}${config.logoPath}`;
        setLogoPreview(fullUrl);
      } else if (config.logoPath === null) {
        // If logoPath is null, no logo exists
        setLogoPreview(null);
        // Reset the removal flag since there's no logo anyway
        setShouldRemoveLogo(false);
      }
    }
  }, [config, form]);

  const handleLogoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size exceeds 5MB limit');
        return;
      }

      setLogoFile(file);

      // Cleanup previous preview URL
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }

      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      previewUrlRef.current = previewUrl;
      setLogoPreview(previewUrl);

      // Mark form as dirty to enable the Save button
      form.setValue('name', form.getValues('name'), { shouldDirty: true });
    }
  };

  const handleRemoveLogo = () => {
    // Call the remove logo API directly
    removeLogoMutate(undefined, {
      onSuccess: () => {
        toast.success('Logo removed successfully');
        // Cleanup preview URL if it's a blob URL
        if (previewUrlRef.current && previewUrlRef.current.startsWith('blob:')) {
          URL.revokeObjectURL(previewUrlRef.current);
          previewUrlRef.current = null;
        }

        // Update the form to set logoPath to null and make it dirty
        setLogoFile(null);
        setLogoPreview(null);
        setShouldRemoveLogo(true); // Mark that logo should be removed on save
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }

        // Mark the form as dirty to enable the Save button
        form.setValue('name', form.getValues('name'), { shouldDirty: true });

        // Invalidate metadata query to refresh the logo in header
        queryClient.invalidateQueries({
          queryKey: getRootControllerGetMetadataQueryKey(),
        });
      },
      onError: (error) => {
        console.error('Remove logo error:', error);
        toast.error('Failed to remove logo');
      },
    });
  };

  const onSubmit = async (values: SystemConfigFormValues) => {
    // If there's a new logo file, upload it first
    if (logoFile) {
      try {
        await uploadLogoMutation.mutateAsync({
          data: { file: logoFile },
        });
        // If logo upload succeeds, then update the config
        updateConfigMutation.mutate({
          data: {
            name: values.name,
          },
        });
      } catch (error) {
        console.error('Logo upload failed:', error);
        toast.error('Failed to upload logo');
      }
    } else if (shouldRemoveLogo) {
      // If logo should be removed, update the config without logoPath
      updateConfigMutation.mutate({
        data: {
          name: values.name,
          // Don't include logoPath to remove it (assuming the API handles this)
        },
      });
    } else {
      // If no new logo and no logo removal, just update the config
      updateConfigMutation.mutate({
        data: {
          name: values.name,
        },
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex justify-center items-center h-32">
          <div>Loading...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>System Configuration</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>System Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter system name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Logo Upload Section */}
            <div className="space-y-4">
              <Label>System Logo</Label>

              {/* Current Logo Preview */}
              {logoPreview && (
                <div className="flex items-center space-x-4">
                  <img
                    src={logoPreview}
                    alt="Current logo"
                    className="w-16 h-16 object-contain rounded border"
                  />
                  <div className="flex space-x-2">
                    <ConfirmDialog
                      title="Remove Logo"
                      description="Are you sure you want to remove the system logo? This action cannot be undone."
                      onConfirm={handleRemoveLogo}
                      trigger={
                        <Button
                          type="button"
                          variant="outline"
                          disabled={uploadLogoMutation.isPending}
                        >
                          Remove
                        </Button>
                      }
                      confirmText="Remove"
                      cancelText="Cancel"
                    />
                  </div>
                </div>
              )}

              {/* File Upload */}
              <div className="flex items-center space-x-4">
                <div className="flex-1">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleLogoChange}
                    accept="image/*"
                    className="hidden"
                    id="logo-upload"
                  />
                  <Label
                    htmlFor="logo-upload"
                    className="flex items-center justify-center px-4 py-2 border border-dashed rounded cursor-pointer hover:bg-muted"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {logoFile ? logoFile.name : 'Choose logo file'}
                  </Label>
                </div>
              </div>

              {!logoPreview && !logoFile && (
                <p className="text-sm text-muted-foreground">
                  No logo uploaded yet. Supported formats: JPG, PNG, GIF, WEBP
                </p>
              )}
            </div>

            <Button type="submit">
              {updateConfigMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
