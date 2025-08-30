import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Tool } from '@/services/apis/gen/queries';
import { Verified } from 'lucide-react';
import React from 'react';

interface ToolCardProps {
    tool: Tool;
    button?: React.ReactNode;
}

const ToolCard = ({ tool, button }: ToolCardProps) => {
    return (
        <Card key={tool.id} className="flex flex-col overflow-hidden pt-0">
            <div className="w-full dark:bg-white p-2 flex justify-center">
                <img
                    src={tool.logoUrl}
                    alt={tool.name}
                    className="h-16 object-contain"
                />
            </div>
            <CardContent className="flex flex-col gap-4">
                <div className="flex gap-3 items-center justify-between">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <CardTitle className="text-left text-lg">{tool.name}</CardTitle>
                            {tool.isOfficialSupport && (
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Verified className="w-4 h-4 text-blue-500" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Official Support</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>

                            )}
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                            <Badge variant="secondary" className="text-xs font-normal px-1.5 py-0.5">{tool.version}</Badge>
                            <Badge variant="secondary" className="text-xs font-normal px-1.5 py-0.5 w-fit">
                                {tool.category
                                    .split('_')
                                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                    .join(' ')}
                            </Badge>
                        </div>
                    </div>
                    <div className="flex-shrink-0">
                        {button}
                    </div>
                </div>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <p className="text-sm text-muted-foreground line-clamp-4">
                                {tool.description}
                            </p>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="w-full max-w-[300px] p-2">
                            <p className="text-sm">
                                {tool.description}
                            </p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>

            </CardContent>
        </Card>
    );
};

export default ToolCard;