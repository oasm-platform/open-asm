import { Badge } from "@/components/ui/badge";

interface NewBadgeProps {
    className?: string;
}

export function NewBadge({ className = "" }: NewBadgeProps) {
    return (
        <Badge
            variant="default"
            className={`px-1 py-0.5 text-[8px] leading-none h-4 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white border-red-500 ${className}`}
        >
            NEW
        </Badge>
    );
}