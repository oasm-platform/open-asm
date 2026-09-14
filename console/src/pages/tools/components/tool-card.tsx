import { Badge } from '@/components/ui/badge';
import Image from '@/components/ui/image';
import { type Tool } from '@/services/apis/gen/queries';
import { useNavigate } from '@tanstack/react-router';
import { BadgeCheck } from 'lucide-react';

interface ToolCardProps {
  tool: Tool;
}

function formatCategory(category: string): string {
  return category
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const ToolCard = ({ tool }: ToolCardProps) => {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate({ to: '/tools/$id', params: { id: tool.id } })}
      className="flex flex-col items-start gap-2 rounded-lg border p-5 text-left transition-colors hover:border-primary hover:bg-accent/50 cursor-pointer"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="light:bg-black dark:bg-white rounded-lg p-[3px] shrink-0">
          <Image
            className="rounded"
            url={tool.logoUrl}
            height={24}
            width={24}
          />
        </div>
        <h3 className="text-base font-semibold">{tool.name}</h3>
        {tool.isOfficialSupport && (
          <span title="Official" className="inline-flex shrink-0">
            <BadgeCheck className="size-4 text-blue-500" />
          </span>
        )}
        <Badge variant="secondary">{formatCategory(tool.category)}</Badge>
      </div>
      <p className="text-sm text-muted-foreground line-clamp-2">
        {tool.description || 'No description available.'}
      </p>
    </button>
  );
};

export default ToolCard;
