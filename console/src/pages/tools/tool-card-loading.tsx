import { Card, CardContent } from '@/components/ui/card';

interface ToolCardSkeletonProps {
    /**
     * The number of skeleton cards to render.
     */
    count?: number;
}

const ToolCardSkeleton = ({ count = 5 }: ToolCardSkeletonProps) => {
    // Create an array of a specified length to map over for rendering multiple cards
    const skeletonCards = Array.from({ length: count }, (_, index) => (
        <Card key={index} className="flex flex-col overflow-hidden pt-0 animate-pulse">
            {/* Placeholder for the logo image */}
            <div className="w-full h-16 dark:bg-white p-4 flex justify-center bg-gray-200">
                {/* We don't need to render anything inside, the background color acts as the placeholder */}
            </div>

            <CardContent className="flex flex-col gap-2 p-6">
                {/* Placeholder for the Install/Installed button */}
                <div className="w-full h-10 rounded-md bg-gray-200"></div>

                <div className="flex gap-3 items-center justify-between">
                    {/* Placeholder for the Card Title */}
                    <div className="w-3/4 h-6 bg-gray-200 rounded-md"></div>
                    {/* Placeholder for the Badge */}
                    <div className="w-1/4 h-6 bg-gray-200 rounded-full"></div>
                </div>

                {/* Placeholders for the description text lines */}
                <div className="h-4 bg-gray-200 rounded-md"></div>
                <div className="h-4 w-11/12 bg-gray-200 rounded-md"></div>
                <div className="h-4 w-10/12 bg-gray-200 rounded-md"></div>
                <div className="h-4 w-9/12 bg-gray-200 rounded-md"></div>
            </CardContent>
        </Card>
    ));

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {skeletonCards}
        </div>
    );
};

export default ToolCardSkeleton;
