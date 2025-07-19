import { DropdownMenuItem } from '@radix-ui/react-dropdown-menu';
import { Trash2Icon } from 'lucide-react';

const DeleteTarget = () => {
    return (
        <DropdownMenuItem

        >
            <Trash2Icon className="mr-1 h-4 w-4" />  Delete
        </DropdownMenuItem>
    );
};

export default DeleteTarget;