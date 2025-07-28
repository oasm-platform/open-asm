import { useRootControllerGetMetadata } from "@/services/apis/gen/queries";
import { Navigate, useLocation } from "react-router-dom";

export default function RegisterRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data, isFetched } = useRootControllerGetMetadata();
  const location = useLocation();
  const currentPath =
    location.pathname == "/init-admin" ? "/" : location.pathname;

  if (!isFetched) return <></>;

  if (data?.isInit) {
    return <Navigate to={currentPath} />;
  }

  return <>{children}</>;
}
