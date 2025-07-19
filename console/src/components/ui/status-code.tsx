interface StatusCodeProps {
    code?: string;
}

const getStyles = (
    variant: "success" | "warning" | "destructive" | "secondary"
) => {
    switch (variant) {
        case "success":
            return {
                color: "#16a34a", // green-600
                backgroundColor: "#bbf7d0", // green-200
                borderColor: "#86efac", // green-300
            };
        case "warning":
            return {
                color: "#7e22ce", // purple-700
                backgroundColor: "#e9d5ff", // purple-200
                borderColor: "#d8b4fe", // purple-300
            };
        case "destructive":
            return {
                color: "#dc2626", // red-600
                backgroundColor: "#fecaca", // red-200
                borderColor: "#fca5a5", // red-300
            };
        default:
            return {
                color: "#475569", // slate-600
                backgroundColor: "#e2e8f0", // slate-200
                borderColor: "#cbd5e1", // slate-300
            };
    }
};

const StatusCode = ({ code }: StatusCodeProps) => {
    if (!code) return <></>;
    const codeStr = code.toString();

    let variant: "secondary" | "success" | "warning" | "destructive" = "secondary";
    if (codeStr.startsWith("2")) variant = "success";
    else if (codeStr.startsWith("3")) variant = "warning";
    else if (codeStr.startsWith("4") || codeStr.startsWith("5")) variant = "destructive";

    const style = getStyles(variant);

    return (
        <div
            style={{
                display: "inline-block",
                padding: "1px 5px",
                fontSize: "0.7rem",
                fontWeight: 500,
                borderRadius: "0.375rem",
                border: `1px solid ${style.borderColor}`,
                backgroundColor: style.backgroundColor,
                color: style.color,
            }}
        >
            {codeStr}
        </div>
    );
};

export default StatusCode;
