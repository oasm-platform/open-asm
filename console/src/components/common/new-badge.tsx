import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

interface NewBadgeProps {
    className?: string;
    /** Badge text; defaults to "New". */
    children?: ReactNode;
    title?: string;
}

export function NewBadge({ className = "", children = "New", title }: NewBadgeProps) {
    return (
        <Badge
            variant="default"
            title={title}
            className={`h-4 rounded-md border-transparent bg-destructive/12 px-1.5 text-[9px] font-semibold uppercase leading-none tracking-wider text-destructive hover:bg-destructive/18 ${className}`}
        >
            {/* Trim the line box to the caps so flex centring centres the
                letters themselves (an all-caps label has no descenders, so the
                untrimmed box sits it high), and drop the tracking the last
                letter adds on its right. */}
            <span className="-mr-[0.05em] [text-box:trim-both_cap_alphabetic]">
                {children}
            </span>
        </Badge>
    );
}
