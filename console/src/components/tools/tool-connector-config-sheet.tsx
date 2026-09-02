import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ToolConfigForm } from '@/components/tools/tool-config-form';
import { useToolSchema } from '@/hooks/use-tool-schema';
import {
  useToolConfigProfilesControllerCreate,
  useToolConfigProfilesControllerUpdate,
  getToolConfigProfilesControllerListQueryKey,
} from '@/services/apis/gen/queries';
import type { Tool } from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface ToolConnectorConfigSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tool: Tool;
  initialData?: {
    id: string;
    name: string;
    config: Record<string, unknown>;
    isDefault?: boolean;
  };
  onSuccess?: () => void;
}

export function ToolConnectorConfigSheet({
  open,
  onOpenChange,
  tool,
  initialData,
  onSuccess,
}: ToolConnectorConfigSheetProps) {
  const queryClient = useQueryClient();
  const isEdit = !!initialData;

  const [profileName, setProfileName] = useState('');

  // Fetch schema internally — no need for parent to pass it
  const { data: schemaData, isLoading: isSchemaLoading } = useToolSchema(
    open ? tool.id : '',
  );
  const schema = schemaData?.schema;

  useEffect(() => {
    if (open) {
      setProfileName(initialData?.name ?? '');
    }
  }, [open, initialData?.name]);

  const { mutate: createProfile, isPending: isCreating } =
    useToolConfigProfilesControllerCreate({
      mutation: {
        onSuccess: () => {
          toast.success('Profile created');
          queryClient.invalidateQueries({
            queryKey: getToolConfigProfilesControllerListQueryKey(tool.id),
          });
          queryClient.invalidateQueries({ queryKey: ['tools'] });
          onOpenChange(false);
          onSuccess?.();
        },
        onError: (err: unknown) => {
          const msg =
            err instanceof Error ? err.message : 'Failed to create profile';
          toast.error(msg);
        },
      },
    });

  const { mutate: updateProfile, isPending: isUpdating } =
    useToolConfigProfilesControllerUpdate({
      mutation: {
        onSuccess: () => {
          toast.success('Profile updated');
          queryClient.invalidateQueries({
            queryKey: getToolConfigProfilesControllerListQueryKey(tool.id),
          });
          queryClient.invalidateQueries({ queryKey: ['tools'] });
          onOpenChange(false);
          onSuccess?.();
        },
        onError: (err: unknown) => {
          const msg =
            err instanceof Error ? err.message : 'Failed to update profile';
          toast.error(msg);
        },
      },
    });

  const isPending = isCreating || isUpdating;

  const handleSubmit = (config: Record<string, unknown>) => {
    if (!profileName.trim()) {
      toast.error('Profile name is required');
      return;
    }

    if (isEdit && initialData) {
      updateProfile({
        toolId: tool.id,
        id: initialData.id,
        data: {
          name: profileName.trim(),
          config,
          isDefault: initialData.isDefault,
        },
      });
    } else {
      createProfile({
        toolId: tool.id,
        data: {
          name: profileName.trim(),
          config,
          isDefault: true,
        },
      });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {isEdit ? 'Edit Configuration Profile' : 'Create Configuration Profile'}
          </SheetTitle>
          <SheetDescription>
            {isEdit
              ? `Update the profile for ${tool.name}`
              : `Configure ${tool.name} before use`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="profile-name">
              Profile name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="profile-name"
              placeholder="default"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
            />
          </div>

          {schema ? (
            <ToolConfigForm
              schema={schema as import('@/components/tools/tool-config-form').JSONSchema}
              initialValues={initialData?.config}
              onSubmit={handleSubmit}
              onCancel={() => onOpenChange(false)}
              submitLabel={isEdit ? 'Update' : 'Create'}
              isSubmitting={isPending}
            />
          ) : isSchemaLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading schema...
            </div>
          ) : (
            <div className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
              This tool doesn't require configuration. You can still create a
              profile (empty config) to use as default.
            </div>
          )}
        </div>

        {!schema && (
          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            {!isSchemaLoading && (
              <Button
                type="button"
                onClick={() => handleSubmit(initialData?.config ?? {})}
                disabled={isPending}
              >
                {isEdit ? 'Update' : 'Create'}
              </Button>
            )}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
