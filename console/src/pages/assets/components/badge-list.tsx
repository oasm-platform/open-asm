import { Badge } from "@/components/ui/badge";
import { type LucideIcon } from "lucide-react";

export default function BadgeList({
  list,
  Icon,
}: {
  list: string[] | number[];
  Icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-wrap gap-0.5">
      {list?.map((item: string | number) => (
        <Badge variant="outline" className="mr-1 h-7" key={item}>
          {Icon && <Icon />}
          {item}
        </Badge>
      ))}
    </div>
  );
}
