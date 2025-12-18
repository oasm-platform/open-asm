import Layout from '@/components/common/layout/layout';
import Splash from '@/components/common/layout/splash';
import AssetGroupDetail from '@/pages/asset-group/asset-group-detail';
import { AssetGroups } from '@/pages/asset-group/asset-groups';
import Assets from '@/pages/assets/assets';
import DetailAsset from '@/pages/assets/detail-asset';
import Dashboard from '@/pages/dashboard/dashboard';
import CreateIssue from '@/pages/issues/create-issue';
import IssueDetail from '@/pages/issues/issue-detail';
import Issues from '@/pages/issues/issues';
import Login from '@/pages/login/login';
import NotificationsPage from '@/pages/notifications/notifications';
import CreateProviderPage from '@/pages/providers/create-provider';
import DetailProvider from '@/pages/providers/detail-provider';
import EditProviderPage from '@/pages/providers/edit-provider';
import ProvidersPage from '@/pages/providers/providers';
import Register from '@/pages/register/register';
import Search from '@/pages/search/search';
import CreateMcpPermission from '@/pages/settings/components/create-mcp-permission';
import Settings from '@/pages/settings/settings';
import Studio from '@/pages/studio/studio';
import DetailTarget from '@/pages/targets/detail-target';
import Targets from '@/pages/targets/targets';
import ToolDetail from '@/pages/tools/components/tool-detail';
import Tools from '@/pages/tools/tools';
import DetailVulnerability from '@/pages/vulnerabilities/detail-vulnerability';
import Vulnerabilities from '@/pages/vulnerabilities/vulnerabilities';
import Workers from '@/pages/workers/workers';
import Workflow from '@/pages/workflow/workflow';
import { createBrowserRouter } from 'react-router-dom';
import GuestRoute from './GuestRoute';
import NotFound from './NotFound';
import ProtectedRoute from './ProtectedRoute';
import RegisterRoute from './RegisterRoute';

export const router = createBrowserRouter([
  {
    path: 'init-admin',
    element: (
      <RegisterRoute>
        <Register />
      </RegisterRoute>
    ),
  },
  {
    path: '/',
    element: (
      <Splash>
        <Layout />
      </Splash>
    ),
    children: [
      {
        path: 'login',
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
            path: '',
            element: <Dashboard />,
          },
          {
            path: 'notifications',
            element: <NotificationsPage />,
          },
          {
            path: 'studio',
            children: [{ path: '', element: <Studio /> }],
          },
          {
            path: 'groups',
            children: [{ path: '', element: <Workflow /> }],
          },
          {
            path: 'settings',
            children: [
              {
                path: 'mcp/create',
                element: <CreateMcpPermission />,
              },
              {
                path: '',
                element: <Settings defaultTab="account" />,
              },
              {
                path: ':tab',
                element: <Settings />,
              },
            ],
          },
          {
            path: 'targets',
            children: [
              {
                path: '',
                element: <Targets />,
              },
              {
                path: ':id',
                element: <DetailTarget />,
              },
            ],
          },
          {
            path: 'vulnerabilities',
            children: [
              {
                path: '',
                element: <Vulnerabilities />,
              },
              {
                path: ':id',
                element: <DetailVulnerability />,
              },
            ],
          },
          {
            element: <Workers />,
            path: 'workers',
          },
          {
            path: 'tools',
            children: [
              {
                path: '',
                element: <Tools />,
              },
              {
                path: ':id',
                element: <ToolDetail />,
              },
            ],
          },
          {
            element: <Search />,
            path: 'search',
          },
          {
            path: 'assets',
            children: [
              {
                path: '',
                element: <Assets />,
              },
              {
                path: ':id',
                element: <DetailAsset />,
              },
              {
                path: 'groups',
                children: [
                  {
                    path: '',
                    element: <AssetGroups />,
                  },
                  {
                    path: ':id',
                    element: <AssetGroupDetail />,
                  },
                ],
              },
            ],
          },
          {
            path: 'providers',
            children: [
              {
                path: '',
                element: <ProvidersPage />,
              },
              {
                path: 'create',
                element: <CreateProviderPage />,
              },
              {
                path: ':id',
                element: <DetailProvider />,
              },
              {
                path: ':id/edit',
                element: <EditProviderPage />,
              },
            ],
          },
          {
            path: 'issues',
            children: [
              {
                path: '',
                element: <Issues />,
              },
              {
                path: 'create',
                element: <CreateIssue />,
              },
              {
                path: ':id',
                element: <IssueDetail />,
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
