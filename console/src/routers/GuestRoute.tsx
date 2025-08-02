import { useRootControllerGetMetadata } from "@/services/apis/gen/queries";
import { authClient } from "@/utils/authClient";
import type { JSX } from "react";
import { Navigate } from "react-router-dom";

const GuestRoute = ({ children }: { children: JSX.Element }) => {
  const { useSession } = authClient;
  const { data, isPending } = useSession();

  const { data: metadata, isFetched } = useRootControllerGetMetadata();

  if (!isFetched) return null;
  if (!metadata?.isInit) {
    return <Navigate to="/init-admin" />;
  }

  if (data && !isPending) {
    return <Navigate to="/" />;
  }

  return <>{children}</>;
};

export default GuestRoute;

