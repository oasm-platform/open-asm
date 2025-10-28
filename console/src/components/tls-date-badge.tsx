import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Lock } from 'lucide-react';

interface TlsDateBadgeProps {
    date: string | Date;
}

export const TlsDateBadge = ({ date }: TlsDateBadgeProps) => {
    const daysLeft = Math.ceil(
        (new Date(date).getTime() - new Date().getTime()) /
        (1000 * 60 * 60 * 24),
    );

    if (daysLeft <= 0) {
        return (
            <Badge
                variant="destructive"
                className="h-5 text-xs"
            >
                Expired
            </Badge>
        );
    }

    const color = daysLeft < 30 ? 'red' : daysLeft < 60 ? 'yellow' : 'green';

    return (
        <Badge
            variant="outline"
            className={cn(
                'h-5 text-xs',
                color === 'red'
                    ? 'text-red-500 border-red-500'
                    : color === 'yellow'
                        ? 'text-yellow-500 border-yellow-500'
                        : 'text-green-500 border-green-500',
            )}
        >
            <Lock size={14} color={color} className="mr-1" />
            SSL {daysLeft}d
        </Badge>
    );
};
