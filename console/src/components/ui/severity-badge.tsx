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
    critical: { color: "bg-red-200", text: "text-red-700", border: "border-2 border-red-700" },
    high: { color: "bg-red-100", text: "text-red-700", border: "border-2 border-red-700" },
    medium: { color: "bg-yellow-100", text: "text-yellow-700", border: "border-2 border-yellow-700" },
    low: { color: "bg-green-100", text: "text-green-700", border: "border-2 border-green-700" },
    info: { color: "bg-blue-50", text: "text-blue-700", border: "border-2 border-blue-700" },
};

export function SeverityBadge({ severity }: SeverityBadgeProps) {
    const normalizedSeverity = severity.toLowerCase();
    const { color, text, border = "" } = severityColors[normalizedSeverity] || severityColors["info"];

    return (
        <Badge className={`border ${color} ${text} ${border} px-2 py-0.5 rounded-full text-xs font-medium`}>
            {severity.charAt(0).toUpperCase() + severity.slice(1)}
        </Badge>
    );
}

export default SeverityBadge;