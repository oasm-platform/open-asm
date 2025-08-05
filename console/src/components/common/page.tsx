import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../ui/button";

interface PageProps {
    children?: React.ReactNode;
    title?: string;
    isShowButtonGoBack?: boolean;
}
const Page = ({ children, title, isShowButtonGoBack }: PageProps) => {
    const navigate = useNavigate();
    return (
        <div>
            <div className="flex items-center justify-start gap-3 mb-4">
                {isShowButtonGoBack && <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>}
                {title && <h3 className="text-2xl font-bold tracking-tight">{title}</h3>}
            </div>
            {children}
        </div>
    );
};

export default Page;