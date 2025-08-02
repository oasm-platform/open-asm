
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import type { Tool } from '@/services/apis/gen/queries';
import { CheckCircle } from 'lucide-react';

const ToolCard = (tool: Tool) => {
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
                <Button
                    color={tool.isInstalled ? "green" : "outline"}
                    disabled={tool.isInstalled}
                >
                    <CheckCircle className="w-4 h-4" />
                    {tool.isInstalled ? "Installed" : "Install"}
                </Button>
                <div className="flex gap-3 items-center justify-between">
                    <CardTitle className="text-left text-lg">{tool.name}</CardTitle>
                    <Badge variant="outline" className="w-fit">
                        {tool.category
                            .split('_')
                            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                            .join(' ')}
                    </Badge>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-4">
                    {tool.description}
                </p>
            </CardContent>
        </Card>
    );
};

export default ToolCard;