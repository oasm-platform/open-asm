import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { TechnologyDetailDTO } from '@/services/apis/gen/queries';
import { Boxes } from 'lucide-react';

interface TechnologyTooltipProps {
    tech: TechnologyDetailDTO;
}

export function TechnologyTooltip({ tech }: TechnologyTooltipProps) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Badge variant="outline" className="h-7 cursor-pointer" key={tech.name}>
                    {tech?.iconUrl ? (
                        <img
                            src={tech?.iconUrl}
                            alt={tech.name}
                            className="size-4"
                            onError={(e) => {
                                // Fallback to globe icon if image fails to load
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const parent = target.parentElement;
                                if (parent) {
                                    const globeIcon = document.createElement('div');
                                    globeIcon.innerHTML =
                                        '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" class="lucide lucide-globe"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>';
                                    parent.appendChild(globeIcon);
                                }
                            }}
                        />
                    ) : (
                        <Boxes className="size-8" />
                    )}
                    {tech.name}
                </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-[200px] bg-background text-foreground border">
                <div className="flex gap-2">
                    {tech?.iconUrl ? (
                        <img
                            src={tech?.iconUrl}
                            alt={tech.name}
                            className="size-8"
                            onError={(e) => {
                                // Fallback to globe icon if image fails to load
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const parent = target.parentElement;
                                if (parent) {
                                    const globeIcon = document.createElement('div');
                                    globeIcon.innerHTML =
                                        '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" class="lucide lucide-globe"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>';
                                    parent.appendChild(globeIcon);
                                }
                            }}
                        />
                    ) : (
                        <Boxes className="size-8" />
                    )}
                    <div className="flex flex-col">
                        <span className="font-medium">{tech.name}</span>
                        {tech.categoryNames && (
                            <div className="text-xs text-muted-foreground">
                                {tech.categoryNames.join(', ')}
                            </div>
                        )}
                    </div>
                </div>
                {tech.description && (
                    <p className="text-xs mt-2">{tech.description}</p>
                )}
            </TooltipContent>
        </Tooltip>
    );
}