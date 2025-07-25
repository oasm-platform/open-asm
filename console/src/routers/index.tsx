import Layout from "@/components/common/layout/Layout";
import Assets from "@/pages/assets/assets";
import Dashboard from "@/pages/dashboard/dashboard";
import Login from "@/pages/login/login";
import DetailTarget from "@/pages/targets/detail-target";
import Targets from "@/pages/targets/targets";
import Workers from "@/pages/workers/workers";
import { createBrowserRouter } from "react-router-dom";
import GuestRoute from "./GuestRoute";
import NotFound from "./NotFound";
import ProtectedRoute from "./ProtectedRoute";

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
        element: <ProtectedRoute />,
        children: [
          {
            path: "",
            element: <Dashboard />,
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
            element: <Workers />,
            path: "workers",
          },
          {
            element: <Assets />,
            path: "assets",
          },
        ],
      },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
