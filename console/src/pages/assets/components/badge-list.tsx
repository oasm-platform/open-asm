import { Badge } from '@/components/ui/badge';
import { type LucideIcon } from 'lucide-react';

export default function BadgeList({
  list,
  Icon,
  maxDisplay = list.length,
}: {
  list: string[] | number[];
  Icon?: LucideIcon;
  maxDisplay?: number;
}) {
  const displayList = list.slice(0, maxDisplay);
  const remainCount = list.length - maxDisplay;
  return (
    <div className="flex flex-wrap gap-1">
      {displayList?.map((item: string | number) => (
        <Badge variant="outline" className="h-7" key={item}>
          {Icon && <Icon />}
          {item}
        </Badge>
      ))}
      {remainCount > 0 && (
        <Badge variant="outline" className="text-xs">
          +{remainCount}
        </Badge>
      )}
    </div>
  );
}
