import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  useAssetsControllerGenerateServiceTags,
  useAssetsControllerUpdateAssetById,
  type AssetTag,
} from '@/services/apis/gen/queries';
import { Loader2, Plus, Sparkles, Tag } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';

interface AddTagDialogProps {
  id: string;
  tags?: AssetTag[];
  refetch: () => void;
}
const AddTagDialog = (props: AddTagDialogProps) => {
  const { id, tags, refetch } = props;
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [tagList, setTagList] = useState<string[]>(
    (tags ?? []).map((tag) => tag.tag),
  );
  const inputRef = useRef<HTMLInputElement>(null);

  const { mutate } = useAssetsControllerUpdateAssetById();
  const { mutate: generateTags, isPending: isGenerating } =
    useAssetsControllerGenerateServiceTags();

  useLayoutEffect(() => {
    if (isOpen && inputRef.current) {
      // Use setTimeout with requestAnimationFrame to ensure the dialog is fully rendered
      setTimeout(() => {
        requestAnimationFrame(() => {
          inputRef.current?.focus(); // Use focus() to ensure input is focused
        });
      }, 50); // Small delay to ensure dialog is rendered
    }
  }, [isOpen, tagList]); // Add tagList to dependency array to ensure focus when tags change

  const handleGenerateTags = () => {
    generateTags(
      { data: { assetServiceId: id } },
      {
        onSuccess: (response) => {
          const generatedTags = response.tags;
          if (generatedTags.length === 0) {
            toast.error('AI did not generate any tags');
            return;
          }
          setTagList((prev) => [
            ...new Set([...prev, ...generatedTags]),
          ]);
          toast.success(`Generated ${generatedTags.length} tags`);
        },
        onError: () => {
          toast.error('Failed to generate tags');
        },
      },
    );
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // If there's text in the input, add it as a new tag
      if (inputValue.trim()) {
        const newTag = inputValue.trim();
        if (!tagList.includes(newTag)) {
          const updatedTagList = [...tagList, newTag];
          setTagList(updatedTagList);
          setInputValue('');
          // Save all tags with the updated list
          handleSave(updatedTagList);
        } else {
          // Tag already exists, just clear input and save
          setInputValue('');
          handleSave();
        }
      } else {
        // Save all tags
        handleSave();
      }
    } else if (e.key === ',') {
      e.preventDefault();
      const newTag = inputValue.trim().replace(/,$/, ''); // Remove trailing comma
      if (newTag && !tagList.includes(newTag)) {
        setTagList([...tagList, newTag]);
        setInputValue('');
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    // Check if the input ends with a comma
    if (value.endsWith(',')) {
      const newTag = value.slice(0, -1).trim(); // Remove the comma and trim
      if (newTag && !tagList.includes(newTag)) {
        setTagList([...tagList, newTag]);
        setInputValue('');
      }
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTagList(tagList.filter((tag) => tag !== tagToRemove));
  };

  const handleSave = (updatedTagList?: string[]) => {
    const newTag = inputValue.trim();
    const tagsToSave = newTag && !tagList.includes(newTag)
      ? [...(updatedTagList ?? tagList), newTag]
      : (updatedTagList ?? tagList);

    mutate(
      {
        id: props.id,
        data: {
          tags: tagsToSave,
        },
      },
      {
        onSuccess: () => {
          setIsOpen(false);
          refetch();
        },
        onError: () => {
          toast.error('Failed to add tag');
        },
      },
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="h-8">
          <Plus /> Add tag
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add tags</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="relative flex flex-wrap gap-2 items-center border rounded-md p-2 min-h-10 bg-transparent">
            {tagList.map((tag, index) => (
              <Badge
                key={index}
                variant="outline"
                className="flex items-center gap-1 h-7 rounded-md cursor-pointer"
                onClick={() => removeTag(tag)}
              >
                <Tag size={14} /> {tag}
                <button
                  type="button"
                  className="ml-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent triggering the badge's onClick
                    removeTag(tag);
                  }}
                >
                  ×
                </button>
              </Badge>
            ))}
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              className="flex-1 border-0 shadow-none  p-0 h-6 bg-transparent focus:outline-none pr-8"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Auto-Generate"
              onClick={handleGenerateTags}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
            </button>
          </div>
          <div className="flex flex-row items-center gap-2">
            <p className="text-xs text-gray-500">
              Type tags and press ',' to add.
            </p>
          </div>
        </div>
        <DialogFooter className="flex justify-between items-center">
          <div /> {/* Spacer to keep buttons right-aligned */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" onClick={() => handleSave()}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddTagDialog;
