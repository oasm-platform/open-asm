import Layout from "@/components/common/layout/layout";
import Assets from "@/pages/assets/assets";
import DetailAsset from "@/pages/assets/detail-asset";
import Dashboard from "@/pages/dashboard/dashboard";
import Login from "@/pages/login/login";
import ProvidersPage from "@/pages/providers/providers";
import DetailProvider from "@/pages/providers/detail-provider";
import CreateProviderPage from "@/pages/providers/create-provider";
import EditProviderPage from "@/pages/providers/edit-provider";
import Register from "@/pages/register/register";
import Search from "@/pages/search/search";
import Settings from "@/pages/settings/settings";
import DetailTarget from "@/pages/targets/detail-target";
import Targets from "@/pages/targets/targets";
import ToolDetail from "@/pages/tools/components/tool-detail";
import Tools from "@/pages/tools/tools";
import Vulnerabilities from "@/pages/vulnerabilities/vulnerabilities";
import Workers from "@/pages/workers/workers";
import { createBrowserRouter } from "react-router-dom";
import GuestRoute from "./GuestRoute";
import NotFound from "./NotFound";
import ProtectedRoute from "./ProtectedRoute";
import RegisterRoute from "./RegisterRoute";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      {
        path: "login",
        element: (
          <GuestRoute>
            <Login />
          </GuestRoute>
        ),
      },
      {
        path: "init-admin",
        element: (
          <RegisterRoute>
            <Register />
          </RegisterRoute>
        ),
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            path: "",
            element: <Dashboard />,
          },
          {
            path: "settings",
            children: [
              {
                path: "",
                element: <Settings defaultTab="account" />,
              },
              {
                path: ":tab",
                element: <Settings />,
              },
            ],
          },
          {
            path: "targets",
            children: [
              {
                path: "",
                element: <Targets />,
              },
              {
                path: ":id",
                element: <DetailTarget />,
              },
            ],
          },
          {
            path: "vulnerabilities",
            element: <Vulnerabilities />,
          },
          {
            element: <Workers />,
            path: "workers",
          },
          {
            path: "tools",
            children: [
              {
                path: "",
                element: <Tools />,
              },
              {
                path: ":id",
                element: <ToolDetail />,
              },
            ],
          },
          {
            element: <Search />,
            path: "search",
          },
          {
            path: "assets",
            children: [
              {
                path: "",
                element: <Assets />,
              },
              {
                path: ":id",
                element: <DetailAsset />,
              },
            ],
          },
          {
            path: "providers",
            children: [
              {
                path: "",
                element: <ProvidersPage />,
              },
              {
                path: "create",
                element: <CreateProviderPage />,
              },
              {
                path: ":id",
                element: <DetailProvider />,
              },
              {
                path: ":id/edit",
                element: <EditProviderPage />,
              },
            ],
          },
        ],
      },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
