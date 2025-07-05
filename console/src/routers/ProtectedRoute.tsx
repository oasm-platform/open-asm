import ProtectedLayout from "@/components/common/layout/protect-layout";
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import CreateWorkspace from "@/pages/workspaces/create-workspace";
import { authClient } from "@/utils/authClient";
import { Navigate, Outlet, useLocation } from "react-router-dom";
const { useSession } = authClient

const ProtectedRoute = () => {
    const { data, isPending: isLoadingSession } = useSession();
    const location = useLocation();
    const currentPath = location.pathname;
    const { workspaces, isLoading: isLoadingWorkspaces } = useWorkspaceSelector()
    if (!data && !isLoadingSession) {
        return <Navigate to={`/login?redirect=${currentPath}`} />
    }
    if (isLoadingWorkspaces) {
        return <></>
    }
    return (
        <ProtectedLayout>
            {workspaces.length === 0 ? <CreateWorkspace /> : <Outlet />}
        </ProtectedLayout>
    );
};

export default ProtectedRoute;