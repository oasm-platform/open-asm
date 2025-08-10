import { Badge } from "./badge";

interface SeverityBadgeProps {
    severity: string;
}

interface SeverityColor {
    color: string;
    text: string;
    border?: string;
}

const severityColors: Record<string, SeverityColor> = {
    critical: { color: "bg-red-100", text: "text-red-500", border: "border border-red-500" },
    high: { color: "bg-orange-100", text: "text-orange-500", border: "border border-orange-500" },
    medium: { color: "bg-yellow-100", text: "text-yellow-500", border: "border border-yellow-500" },
    low: { color: "bg-blue-100", text: "text-blue-500", border: "border border-blue-500" },
    info: { color: "bg-gray-100", text: "text-gray-500", border: "border border-gray-500" },
};

export function SeverityBadge({ severity }: SeverityBadgeProps) {
    const normalizedSeverity = severity.toLowerCase();
    const { color, text, border = "" } = severityColors[normalizedSeverity] || severityColors["info"];

    return (
        <Badge className={`${color} ${text} ${border} px-2 py-0.5 rounded-full text-xs font-medium`}>
            {severity.charAt(0).toUpperCase() + severity.slice(1)}
        </Badge>
    );
}

export default SeverityBadge;