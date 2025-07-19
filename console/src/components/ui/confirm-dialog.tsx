import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import React, { useState, type JSX } from "react";

interface ConfirmDialogProps {
    title: string;
    description?: string;
    onConfirm: () => void;
    trigger: JSX.Element;
    confirmText?: string;
    cancelText?: string;
}

export const ConfirmDialog = ({
    title,
    description,
    onConfirm,
    trigger,
    confirmText = "Confirm",
    cancelText = "Cancel",
}: ConfirmDialogProps) => {
    const [open, setOpen] = useState(false);

    const handleConfirm = () => {
        onConfirm();
        setOpen(false);
    };

    const clonedTrigger = React.cloneElement(trigger, {
        onClick: (e: React.MouseEvent) => {
            e.preventDefault(); // Prevent default to avoid dropdown closing
            setOpen(true);
        },
        onMouseDown: (e: React.MouseEvent) => {
            // Prevent dropdown from auto-closing
            e.preventDefault();
        },
    });

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {clonedTrigger}
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    {description && <DialogDescription>{description}</DialogDescription>}
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        {cancelText}
                    </Button>
                    <Button onClick={handleConfirm}>{confirmText}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
