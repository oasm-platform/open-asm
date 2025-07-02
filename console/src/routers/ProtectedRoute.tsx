import ProtectedLayout from "@/components/common/layout/protect-layout";
import { authClient } from "@/utils/authClient";
import { Navigate, Outlet, useLocation } from "react-router-dom";
const { useSession } = authClient

const ProtectedRoute = () => {
    const { data, isPending } = useSession();
    const location = useLocation();
    const currentPath = location.pathname;
    if (!data && !isPending) {
        return <Navigate to={`/login?redirect=${currentPath}`} />
    }
    return (
        <ProtectedLayout>
            <Outlet />
        </ProtectedLayout>
    );
};

export default ProtectedRoute;