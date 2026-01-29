import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  getRootControllerGetMetadataQueryKey,
  useStorageControllerUploadFile,
  useSystemConfigsControllerGetConfig,
  useSystemConfigsControllerUpdateConfig,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

/**
 * System Configuration Settings Component
 * Allows administrators to configure system-wide settings including the logo
 */
export default function SystemConfigSettings() {
  const {
    data: config,
    isLoading,
    refetch,
  } = useSystemConfigsControllerGetConfig();
  const { mutateAsync: updateConfig } =
    useSystemConfigsControllerUpdateConfig();
  const { mutateAsync: uploadFile } = useStorageControllerUploadFile();

  const [systemName, setSystemName] = useState(config?.name || '');
  const [originalSystemName, setOriginalSystemName] = useState(
    config?.name || '',
  );
  const [logoPreview, setLogoPreview] = useState<string | null>(
    config?.logoPath ? config.logoPath : null,
  );
  const [uploadedLogoPath, setUploadedLogoPath] = useState<string | null>(null); // Store the actual uploaded path
  const [originalLogoPath, setOriginalLogoPath] = useState<string | null>(
    config?.logoPath ? config.logoPath : null,
  );
  const [hasChanges, setHasChanges] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const nameChanged = systemName !== originalSystemName;
    const logoChanged = logoPreview !== originalLogoPath;
    setHasChanges(nameChanged || logoChanged);
  }, [systemName, logoPreview, originalSystemName, originalLogoPath]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/svg+xml',
    ];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Only image formats are allowed: JPG, PNG, WEBP, SVG');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image size must not exceed 2MB');
      return;
    }

    // Create a preview URL from the selected file
    const previewUrl = URL.createObjectURL(file);
    setLogoPreview(previewUrl);

    try {
      // Upload the file
      const uploadResult = await uploadFile({
        data: {
          file: file,
        },
      });

      // Store the uploaded path but continue using blob URL for preview
      // The server path has issues with missing "/api/storage" prefix
      setUploadedLogoPath(uploadResult.path || null);
      toast.success('Image uploaded successfully');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Image upload failed');
      // Revert to the original logo if upload fails
      setLogoPreview(config?.logoPath || null);
    }
  };

  const handleSave = async () => {
    try {
      // When saving, if we have an uploaded path from the server, use that
      // Otherwise, if we only have a blob URL preview, we should not save it as the logo path
      // because blob URLs are temporary. We should only save the actual server path.
      const logoPathToSend =
        uploadedLogoPath !== null
          ? uploadedLogoPath
          : logoPreview && !logoPreview.startsWith('blob:')
            ? logoPreview
            : undefined;

      await updateConfig({
        data: {
          name: systemName,
          logoPath: logoPathToSend,
        },
      });

      await refetch();
      // Update original values to match current values after successful save
      setOriginalSystemName(systemName);
      setOriginalLogoPath(logoPathToSend ?? null);
      setHasChanges(false);
      toast.success('System configuration updated successfully');
      queryClient.invalidateQueries({
        queryKey: getRootControllerGetMetadataQueryKey(),
      });
    } catch (error) {
      console.error('Update error:', error);
      toast.error('Configuration update failed');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <Card className="w-full max-w-3xl">
      <CardHeader>
        <CardTitle>System Configuration</CardTitle>
        <CardDescription>
          Manage system-wide settings such as name and logo
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <Label htmlFor="system-name">System Name</Label>
          <Input
            id="system-name"
            value={systemName}
            onChange={(e) => setSystemName(e.target.value)}
            placeholder="Enter system name"
          />
        </div>

        <Separator />

        <div className="space-y-4">
          <Label>System Logo</Label>
          <div className="flex flex-col space-y-4 md:flex-row md:space-x-6 md:space-y-0">
            <div className="flex-shrink-0">
              {logoPreview ? (
                <div className="relative">
                  <img
                    src={logoPreview}
                    alt="Logo preview"
                    className="h-16 w-16 object-contain rounded-md border bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setLogoPreview(null);
                    }}
                    className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/90"
                    aria-label="Remove logo"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className="h-16 w-16 flex items-center justify-center rounded-md border bg-muted">
                  <span className="text-sm text-muted-foreground">No logo</span>
                </div>
              )}
            </div>
            <div className="flex flex-col space-y-2">
              <Input
                id="logo-upload"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
              />
              <p className="text-xs text-muted-foreground">
                Supported formats: JPG, PNG, WEBP, SVG. Max size: 2MB
              </p>
            </div>
          </div>
        </div>

        <div className="pt-4">
          <Button onClick={handleSave} disabled={!hasChanges}>
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
