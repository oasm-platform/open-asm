import { useTheme } from "@/components/ui/theme-provider";
import { cn } from "@/lib/utils";
import { ChevronDown, PaletteIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";



export function ThemeSwitcher() {
    const { theme, setTheme } = useTheme();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const themes = [
        { id: "light" as const, label: "Light" },
        { id: "dark" as const, label: "Dark" },
        { id: "system" as const, label: "System" },
    ];

    const currentTheme = themes.find((t) => t.id === theme) || themes[0];

    const handleClickOutside = (event: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
            setIsOpen(false);
        }
    };

    useEffect(() => {
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="font-medium flex items-center">
                    <PaletteIcon className="mr-2" />Theme
                </h4>

                <div className="relative w-40" ref={dropdownRef}>
                    <button
                        type="button"
                        onClick={() => setIsOpen(!isOpen)}
                        className={cn(
                            "w-full flex items-center justify-between px-3 py-2 border rounded-md shadow-sm",
                            "text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary",
                            "bg-background hover:bg-accent"
                        )}
                    >
                        <span>{currentTheme.label}</span>
                        <ChevronDown className={cn(
                            "h-4 w-4 transition-transform duration-200",
                            isOpen ? "transform rotate-180" : ""
                        )} />
                    </button>

                    {isOpen && (
                        <div className="absolute z-10 mt-1 w-full rounded-md bg-popover shadow-lg">
                            <div className="py-1" role="menu" aria-orientation="vertical">
                                {themes.map((t) => (
                                    <button
                                        key={t.id}
                                        onClick={() => {
                                            setTheme(t.id);
                                            setIsOpen(false);
                                        }}
                                        className={cn(
                                            "w-full text-left px-4 py-2 text-sm flex items-center",
                                            "hover:bg-accent hover:text-accent-foreground",
                                            currentTheme.id === t.id ? "bg-accent" : ""
                                        )}
                                        role="menuitem"
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
