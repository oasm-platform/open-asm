import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";

interface AssetsDiscoveringProps {
    domains?: string[];
    targetId?: string;
}

// Main component for discovering assets
const AssetsDiscovering = ({ domains, targetId }: AssetsDiscoveringProps) => {
    // This hook is used to get data from the query cache.
    const queryClient = useQueryClient();

    // Mocking the data for demonstration. In a real app, this would come from a query.
    const assets: any = queryClient.getQueryData(["assets", targetId]);

    // Fallback to mock data if domains is not provided
    domains = domains || assets?.data?.map((i: any) => i.value);

    // State to track the index of the currently displayed domain
    const [currentDomainIndex, setCurrentDomainIndex] = useState(0);

    // Use useEffect to update the domain every 1 second
    useEffect(() => {
        // Set up an interval to change the domain index every 1000ms
        const intervalId = setInterval(() => {
            setCurrentDomainIndex((prevIndex) => (prevIndex + 1) % (domains?.length || 0));
        }, 1000);

        // Clear the interval when the component unmounts to prevent memory leaks
        return () => clearInterval(intervalId);
    }, [domains?.length]);

    return (
        <div className="flex items-center justify-center top-0 my-5 relative">
            {/* Animated border */}
            <motion.div
                className="absolute inset-0 rounded-2xl p-0.5"
                style={{
                    backgroundImage: 'linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899, #10b981, #f59e0b, #3b82f6)',
                    backgroundSize: '400% 100%',
                    zIndex: 10
                }}
                animate={{
                    backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                }}
                transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: 'linear',
                }}
            >
                <div className="bg-background rounded-2xl w-full h-full"></div>
            </motion.div>

            <div className="relative my-5 w-full h-96 overflow-hidden rounded-2xl p-8 flex flex-col items-center justify-center transition-colors duration-500" style={{ zIndex: 20 }}>

                {/* Main content with a more prominent style, using flexbox for equidistant spacing */}
                {/* The text color is set to be visible on any default background */}
                <div className="relative z-20 w-full h-full flex flex-col justify-around items-center text-center text-gray-900 dark:text-white transition-colors duration-500">
                    {/* Header */}
                    <div className="relative text-3xl h-16 md:text-4xl font-extrabold tracking-wide flex items-center">
                        <motion.span
                            className="inline-block text-transparent bg-clip-text leading-tight"
                            style={{
                                backgroundSize: '400% 100%',
                                backgroundImage: 'linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899, #10b981, #f59e0b, #3b82f6)',
                            }}
                            animate={{
                                backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                            }}
                            transition={{
                                duration: 1.5,
                                repeat: Infinity,
                                ease: 'linear',
                            }}

                        >
                            Discovering assets...
                        </motion.span>
                    </div>

                    {/* AnimatePresence for the fade-in/fade-out effect of the domain */}
                    <AnimatePresence mode="wait">
                        <motion.span
                            key={currentDomainIndex}
                            className="text-lg font-mono"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.5 }}
                        >
                            {domains?.[currentDomainIndex]}
                        </motion.span>
                    </AnimatePresence>

                    {/* The core animated search icon with wider horizontal movement */}
                    <motion.div
                        className="w-12 h-12"
                        initial={{ x: "-80%" }}
                        animate={{
                            x: ["-80%", "80%"],
                            scale: [0.8, 1.1, 0.8],
                        }}
                        transition={{
                            duration: 2.5,
                            repeat: Infinity,
                            repeatType: "mirror",
                            ease: "easeInOut",
                        }}
                    >
                        <Search className="w-full h-full text-gray-900 dark:text-white" />
                    </motion.div>
                </div>
            </div>
        </div>
    );
};

export default AssetsDiscovering;
