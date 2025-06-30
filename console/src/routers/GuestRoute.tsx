import { authClient } from "@/utils/authClient";
import type { JSX } from "react";
import { Navigate } from "react-router-dom";

const GuestRoute = ({ children }: { children: JSX.Element }) => {
    const { useSession } = authClient;
    const { data, isPending } = useSession();
    if (data && !isPending) {
        return <Navigate to="/" />;
    }
    return (
        <>{children}</>
    );
};

export default GuestRoute;