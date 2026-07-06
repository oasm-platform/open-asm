import { Badge } from "@/components/ui/badge";

interface NewBadgeProps {
    className?: string;
}

export function NewBadge({ className = "" }: NewBadgeProps) {
    return (
        <Badge
            variant="default"
            className={`h-4 rounded-md border-transparent bg-primary/12 px-1.5 text-[9px] font-semibold uppercase leading-none tracking-wider text-primary hover:bg-primary/18 ${className}`}
        >
            New
        </Badge>
    );
}