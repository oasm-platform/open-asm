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
import { Input } from '@/components/ui/input';
import { useAssetsControllerUpdateAssetById, type AssetTag } from '@/services/apis/gen/queries';
import { Plus, Tag } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';

interface AddTagDialogProps {
    id: string,
    tags: AssetTag[],
    refetch: () => void,
}
const AddTagDialog = (props: AddTagDialogProps) => {
    const { tags, refetch } = props
    const [isOpen, setIsOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [tagList, setTagList] = useState<string[]>(tags.map(tag => tag.tag));

    const { mutate } = useAssetsControllerUpdateAssetById()
    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const newTag = inputValue.trim();
            if (newTag && !tagList.includes(newTag)) {
                setTagList([...tagList, newTag]);
                setInputValue('');
            }
        }
    };

    const removeTag = (tagToRemove: string) => {
        setTagList(tagList.filter(tag => tag !== tagToRemove));
    };

    const handleSave = () => {
        // TODO: Implement save functionality
        mutate({
            id: props.id,
            data: {
                tags: tagList.map(tag => (tag as string))
            }
        }, {
            onSuccess: () => {
                setIsOpen(false);
                refetch()
            },
            onError: () => {
                toast.error("Failed to add tag")
            }
        })
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" className='h-8'><Plus /> Add Tag</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Add Tags</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="flex flex-wrap gap-2">
                        {tagList.map((tag, index) => (
                            <Badge key={index} variant="outline" className="flex items-center gap-1 h-7 rounded-md">
                                <Tag size={14} /> {tag}
                                <button
                                    type="button"
                                    className="ml-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                                    onClick={() => removeTag(tag)}
                                >
                                    ×
                                </button>
                            </Badge>
                        ))}
                    </div>
                    <Input
                        placeholder="Type a tag and press Enter to add"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsOpen(false)}>
                        Close
                    </Button>
                    <Button type="submit" onClick={handleSave}>
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default AddTagDialog;