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
  useAiAssistantControllerGenerateTags,
  useAssetsControllerUpdateAssetById,
  type AssetTag,
} from '@/services/apis/gen/queries';
import { useAsset } from '@/pages/assets/context/asset-context';
import { Loader2, Plus, Sparkles, Tag } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';

interface AddTagDialogProps {
  id: string;
  domain: string;
  tags?: AssetTag[];
  refetch: () => void;
}
const AddTagDialog = (props: AddTagDialogProps) => {
  const { tags, refetch, domain } = props;
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [tagList, setTagList] = useState<string[]>(
    (tags ?? []).map((tag) => tag.tag),
  );
  const inputRef = useRef<HTMLInputElement>(null);

  const { startGenerating, stopGenerating, isGenerating } = useAsset();
  const { mutate } = useAssetsControllerUpdateAssetById();
  const { mutateAsync: generateTagsMutation } =
    useAiAssistantControllerGenerateTags();

  const isCurrentAssetGenerating = isGenerating(props.id);

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
    const tagsToSave = updatedTagList || tagList;
    const newTag = inputValue.trim();

    if (!tagList.includes(newTag) && newTag) {
      tagsToSave.push(newTag);
    }

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

  const handleGenerateTags = async () => {
    if (!domain) {
      toast.error('Domain is required to generate tags');
      return;
    }

    startGenerating(props.id);
    try {
      const domainWithoutPort = domain.split(':')[0];
      const response = await generateTagsMutation({
        data: { domain: domainWithoutPort },
      });
      const generatedTags = response.tags || [];
      const newTags = generatedTags.filter((tag) => !tagList.includes(tag));

      if (newTags.length > 0) {
        const updatedTagList = [...tagList, ...newTags];
        setTagList(updatedTagList);
        toast.success(`Generated ${newTags.length} new tags`);

        // Automatically save the generated tags
        handleSave(updatedTagList);
      } else {
        toast.info('No new tags generated');
      }
    } catch (error) {
      console.error('Failed to generate tags:', error);
      toast.error('Failed to generate tags. Please try again.');
    } finally {
      stopGenerating(props.id);
    }
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
          <div className="flex flex-wrap gap-2 items-center border rounded-md p-2 min-h-10 bg-transparent">
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
              className="flex-1 border-0 shadow-none  p-0 h-6 bg-transparent focus:outline-none"
            />
          </div>
          <div className="flex flex-row items-center gap-2">
            <p className="text-xs text-gray-500">
              Type tags and press ',' to add. Or use
            </p>
            <Button
              variant="ghost"
              onClick={handleGenerateTags}
              disabled={isCurrentAssetGenerating || !domain}
            >
              {isCurrentAssetGenerating ? (
                <>
                  <Loader2 className="animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles />
                  AI generate
                </>
              )}
            </Button>
          </div>
        </div>
        <DialogFooter className="flex justify-between items-center">
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
