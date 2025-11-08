import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { useAssetGroupControllerCreate } from '@/services/apis/gen/queries';
import { useState } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';

interface FormData {
  name: string;
}

export function CreateAssetGroupDialog() {
  const [open, setOpen] = useState(false);
  const { selectedWorkspace } = useWorkspaceSelector();
  const [formData, setFormData] = useState<FormData>({
    name: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { mutate: createAssetGroup, isPending } = useAssetGroupControllerCreate(
    {
      mutation: {
        onSuccess: () => {
          toast.success('Asset group created successfully');
          setFormData({ name: '' });
          setErrors({});
          setOpen(false);
        },
        onError: (error: unknown) => {
          const errorMessage =
            error instanceof Error
              ? error.message
              : 'Failed to create asset group';
          toast.error('Failed to create asset group', {
            description: errorMessage,
          });
        },
      },
    },
  );

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    if (!selectedWorkspace) {
      toast.error('No workspace selected');
      return;
    }

    createAssetGroup({
      data: {
        name: formData.name.trim(),
        workspaceId: selectedWorkspace,
      },
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Create Asset Group
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <DialogHeader>
            <DialogTitle>Create Asset Group</DialogTitle>
            <DialogDescription>
              Add a new asset group to organize your assets.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">
                  Name *
                </Label>
                <div className="col-span-3">
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className={`col-span-3 ${errors.name ? 'border-red-500' : ''}`}
                    placeholder="Enter asset group name"
                  />
                  {errors.name && (
                    <p className="text-red-500 text-sm mt-1">{errors.name}</p>
                  )}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
