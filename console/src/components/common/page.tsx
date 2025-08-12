import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../ui/button";

interface PageProps {
    children?: React.ReactNode;
    title?: string | React.ReactNode;
    header?: React.ReactNode;
    isShowButtonGoBack?: boolean;
}
const Page = ({ children, title, header, isShowButtonGoBack }: PageProps) => {
    const navigate = useNavigate();

    return (
        <div>
            <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                    {isShowButtonGoBack && (
                        <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    )}
                    {title && <h3 className="text-2xl font-bold tracking-tight">{title}</h3>}
                </div>
                <div className="flex-grow w-full">
                    {header}
                </div>
            </div>
            {children}
        </div>
    );
};

export default Page;