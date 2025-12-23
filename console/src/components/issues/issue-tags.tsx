import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  useIssuesControllerUpdate,
  type Issue,
} from '@/services/apis/gen/queries';
import { Pencil, Tag, X } from 'lucide-react';
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { toast } from 'sonner';

interface IssueTagsProps {
  issue: Issue;
  onUpdate?: () => void;
  isEditable?: boolean;
}

/**
 * Component for displaying and editing issue tags.
 * Provides inline editing with add/remove functionality.
 */
const IssueTags = ({ issue, onUpdate, isEditable = true }: IssueTagsProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [tagList, setTagList] = useState<string[]>(issue.tags ?? []);
  const inputRef = useRef<HTMLInputElement>(null);

  const { mutate: updateIssue, isPending } = useIssuesControllerUpdate();

  // Sync tag list when issue data changes (e.g., after refetch)
  useMemo(() => {
    if (!isEditing) {
      setTagList(issue.tags ?? []);
    }
  }, [issue.tags, isEditing]);

  // Focus input when entering edit mode
  useLayoutEffect(() => {
    if (isEditing && inputRef.current) {
      setTimeout(() => {
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      }, 50);
    }
  }, [isEditing, tagList]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setInputValue('');
    setTagList(issue.tags ?? []);
  }, [issue.tags]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (inputValue.trim()) {
          const newTag = inputValue.trim();
          if (!tagList.includes(newTag)) {
            setTagList((prev) => [...prev, newTag]);
          }
          setInputValue('');
        }
      } else if (e.key === ',' || e.key === 'Tab') {
        e.preventDefault();
        const newTag = inputValue.trim().replace(/,$/, '');
        if (newTag && !tagList.includes(newTag)) {
          setTagList((prev) => [...prev, newTag]);
        }
        setInputValue('');
      } else if (e.key === 'Escape') {
        handleCancel();
      } else if (e.key === 'Backspace' && !inputValue && tagList.length > 0) {
        // Remove last tag when backspace is pressed on empty input
        setTagList((prev) => prev.slice(0, -1));
      }
    },
    [inputValue, tagList, handleCancel],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      // Check if the input ends with a comma
      if (value.endsWith(',')) {
        const newTag = value.slice(0, -1).trim();
        if (newTag && !tagList.includes(newTag)) {
          setTagList((prev) => [...prev, newTag]);
        }
        setInputValue('');
      } else {
        setInputValue(value);
      }
    },
    [tagList],
  );

  const removeTag = useCallback((tagToRemove: string) => {
    setTagList((prev) => prev.filter((tag) => tag !== tagToRemove));
  }, []);

  const handleEdit = useCallback(() => {
    setIsEditing(true);
    setTagList(issue.tags ?? []);
  }, [issue.tags]);

  const handleSave = useCallback(() => {
    updateIssue(
      {
        id: issue.id,
        data: {
          tags: tagList,
          title: issue.title,
        },
      },
      {
        onSuccess: () => {
          setIsEditing(false);
          setInputValue('');
          onUpdate?.();
          toast.success('Tags updated successfully');
        },
        onError: () => {
          toast.error('Failed to update tags');
        },
      },
    );
  }, [updateIssue, issue.id, issue.title, tagList, onUpdate]);

  // Read-only view
  if (!isEditing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {tagList.length > 0 ? (
          tagList.map((tag, index) => (
            <Badge
              key={index}
              variant="outline"
              className="flex items-center gap-1 h-6 rounded-md"
            >
              <Tag size={12} />
              {tag}
            </Badge>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">No tags</span>
        )}
        {isEditable && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={handleEdit}
          >
            <Pencil size={12} />
            Edit
          </Button>
        )}
      </div>
    );
  }

  // Edit mode
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 items-center border rounded-md p-2 min-h-10 bg-transparent">
        {tagList.map((tag, index) => (
          <Badge
            key={index}
            variant="outline"
            className="flex items-center gap-1 h-7 rounded-md cursor-pointer hover:bg-destructive/10"
            onClick={() => removeTag(tag)}
          >
            <Tag size={14} />
            {tag}
            <button
              type="button"
              className="ml-1 rounded-full hover:bg-destructive/20"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag);
              }}
            >
              <X size={12} />
            </button>
          </Badge>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Type and press Enter or comma..."
          className="flex-1 min-w-[120px] border-0 shadow-none p-0 h-6 bg-transparent focus:outline-none text-sm"
        />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Press Enter or comma to add tags. Press Backspace to remove the last
          tag.
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isPending}>
            {isPending ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default IssueTags;
