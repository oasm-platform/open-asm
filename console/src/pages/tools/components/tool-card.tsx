import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Tool } from '@/services/apis/gen/queries';
import { Verified } from 'lucide-react';
import React from 'react';
import { useNavigate } from 'react-router-dom';

interface ToolCardProps {
    tool: Tool;
    button?: React.ReactNode;
}

const ToolCard = ({ tool, button }: ToolCardProps) => {
    const navigate = useNavigate();
    
    const handleCardClick = (e: React.MouseEvent) => {
        // Don't navigate if clicking on the button
        if ((e.target as HTMLElement).closest('button')) {
            return;
        }
        navigate(`/tools/${tool.id}`);
    };

    return (
        <Card 
            key={tool.id} 
            className="flex flex-col overflow-hidden pt-0 cursor-pointer transition-all duration-200 hover:shadow-md"
            onClick={handleCardClick}
        >
            <div className="w-full bg-black dark:bg-white p-4 flex justify-center transition-colors duration-200 hover:bg-gray-800 dark:hover:bg-gray-100">
                <img
                    src={tool.logoUrl}
                    alt={tool.name}
                    className="h-16 object-contain"
                />
            </div>
            <CardContent className="flex flex-col gap-4 pt-4">
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
                        <div className="flex items-center gap-1 mt-2">
                            <Badge variant="secondary" className="text-xs font-normal px-2 py-1">
                                {tool.version || 'N/A'}
                            </Badge>
                            <Badge variant="secondary" className="text-xs font-normal px-2 py-1">
                                {tool.category
                                    ? tool.category
                                        .split('_')
                                        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                        .join(' ')
                                    : 'N/A'}
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
                            <p className="text-sm text-muted-foreground line-clamp-3">
                                {tool.description || 'No description available.'}
                            </p>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="w-full max-w-[300px] p-2">
                            <p className="text-sm">
                                {tool.description || 'No description available.'}
                            </p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </CardContent>
        </Card>
    );
};

export default ToolCard;