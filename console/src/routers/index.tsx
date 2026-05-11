import Layout from '@/components/common/layout/layout';
import Splash from '@/components/common/layout/splash';
import { RequireWorkspace } from '@/components/common/require-workspace';
import Users from '@/pages/admin/users';
import AgentDetail from '@/pages/agents/agent-detail';
import AgentsChatPage from '@/pages/agents/agents';
import AgentsLandingPage from '@/pages/agents/agents-landing';
import AgentConversationsPage from '@/pages/agents/conversations';
import CreateAgentPage from '@/pages/agents/create-agent';
import EditAgentPage from '@/pages/agents/edit-agent';
import ProvidersConnectPage from '@/pages/agents/providers-connect';
import AssetGroupDetail from '@/pages/asset-group/asset-group-detail';
import { AssetGroups } from '@/pages/asset-group/asset-groups';
import Assets from '@/pages/assets/assets';
import DetailAsset from '@/pages/assets/detail-asset';
import Dashboard from '@/pages/dashboard/dashboard';
import InternalNetworks from '@/pages/internal-networks/internal-networks';
import CreateInternalNetwork from '@/pages/internal-networks/create-internal-network';
import InternalNetworkDetail from '@/pages/internal-networks/internal-network-detail';
import CreateIssue from '@/pages/issues/create-issue';
import IssueDetail from '@/pages/issues/issue-detail';
import Issues from '@/pages/issues/issues';
import JobsRegistryPage from '@/pages/jobs-registry/jobs-registry';
import Runs from '@/pages/jobs-registry/runs';
import Login from '@/pages/login/login';
import NotificationsPage from '@/pages/notifications/notifications';
import CreateProviderPage from '@/pages/providers/create-provider';
import DetailProvider from '@/pages/providers/detail-provider';
import EditProviderPage from '@/pages/providers/edit-provider';
import ProvidersPage from '@/pages/providers/providers';
import Register from '@/pages/register/register';
import Search from '@/pages/search/search';
import Settings from '@/pages/settings/settings';
import DetailTarget from '@/pages/targets/detail-target';
import StartDiscovery from '@/pages/targets/start-discovery';
import Targets from '@/pages/targets/targets';
import ToolDetail from '@/pages/tools/components/tool-detail';
import Tools from '@/pages/tools/tools';
import DetailVulnerability from '@/pages/vulnerabilities/detail-vulnerability';
import Vulnerabilities from '@/pages/vulnerabilities/vulnerabilities';
import Workers from '@/pages/workers/workers';
import Workspaces from '@/pages/workspaces';
import CreateWorkspace from '@/pages/workspaces/create-workspace';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import AdminRoute from './AdminRoute';
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
        element: <ProtectedRoute layout="application" />,
        children: [
          {
            path: 'workspaces/create',
            element: <CreateWorkspace />,
          },
          {
            path: '',
            element: (
              <RequireWorkspace>
                <Dashboard />
              </RequireWorkspace>
            ),
          },
          {
            path: 'workspaces',
            element: (
              <RequireWorkspace>
                <Workspaces />
              </RequireWorkspace>
            ),
          },
          {
            path: 'notifications',
            element: (
              <RequireWorkspace>
                <NotificationsPage />
              </RequireWorkspace>
            ),
          },
          // {
          //   path: 'studio',
          //   children: [{ path: '', element: <Studio /> }],
          // },
          // {
          //   path: 'groups',
          //   children: [{ path: '', element: <Workflow /> }],
          // },
        ],
      },
      {
        element: <ProtectedRoute layout="settings" />,
        children: [
          {
            path: 'settings',
            children: [
              {
                path: '',
                element: (
                  <RequireWorkspace>
                    <Settings />
                  </RequireWorkspace>
                ),
              },
              {
                path: ':tab',
                element: (
                  <RequireWorkspace>
                    <Settings />
                  </RequireWorkspace>
                ),
              },
            ],
          },
        ],
      },
      {
        element: <ProtectedRoute layout="application" />,
        children: [
          {
            path: 'admin',
            element: <AdminRoute />,
            children: [
              {
                path: 'users',
                element: <Users />,
              },
            ],
          },
          {
            path: 'targets',
            children: [
              {
                path: '',
                element: (
                  <RequireWorkspace>
                    <Targets />
                  </RequireWorkspace>
                ),
              },
              {
                path: 'start-discovery',
                element: (
                  <RequireWorkspace>
                    <StartDiscovery />
                  </RequireWorkspace>
                ),
              },
              {
                path: ':id',
                children: [
                  {
                    index: true,
                    element: <Navigate to="inventory" replace />,
                  },
                  {
                    path: ':tab',
                    element: (
                      <RequireWorkspace>
                        <DetailTarget />
                      </RequireWorkspace>
                    ),
                  },
                ],
              },
            ],
          },
          {
            path: 'vulnerabilities',
            children: [
              {
                path: '',
                element: (
                  <RequireWorkspace>
                    <Vulnerabilities />
                  </RequireWorkspace>
                ),
              },
              {
                path: ':id',
                element: (
                  <RequireWorkspace>
                    <DetailVulnerability />
                  </RequireWorkspace>
                ),
              },
            ],
          },
          {
            element: (
              <RequireWorkspace>
                <Workers />
              </RequireWorkspace>
            ),
            path: 'workers',
          },
          {
            path: 'tools',
            children: [
              {
                path: '',
                element: (
                  <RequireWorkspace>
                    <Tools />
                  </RequireWorkspace>
                ),
              },
              {
                path: ':id',
                element: (
                  <RequireWorkspace>
                    <ToolDetail />
                  </RequireWorkspace>
                ),
              },
            ],
          },
          {
            element: (
              <RequireWorkspace>
                <Search />
              </RequireWorkspace>
            ),
            path: 'search',
          },
          {
            path: 'groups',
            children: [
              {
                path: '',
                element: (
                  <RequireWorkspace>
                    <AssetGroups />
                  </RequireWorkspace>
                ),
              },
              {
                path: ':id',
                element: (
                  <RequireWorkspace>
                    <AssetGroupDetail />
                  </RequireWorkspace>
                ),
              },
            ],
          },
           {
             path: 'internal-networks',
             children: [
               {
                 path: '',
                 element: (
                   <RequireWorkspace>
                     <InternalNetworks />
                   </RequireWorkspace>
                 ),
               },
               {
                 path: 'create',
                 element: (
                   <RequireWorkspace>
                     <CreateInternalNetwork />
                   </RequireWorkspace>
                 ),
               },
               {
                 path: ':id',
                 element: (
                   <RequireWorkspace>
                     <InternalNetworkDetail />
                   </RequireWorkspace>
                 ),
               },
             ],
           },
          {
            path: 'assets',
            children: [
              {
                path: '',
                element: (
                  <RequireWorkspace>
                    <Assets />
                  </RequireWorkspace>
                ),
              },
              {
                path: ':id',
                element: (
                  <RequireWorkspace>
                    <DetailAsset />
                  </RequireWorkspace>
                ),
              },
            ],
          },
          {
            path: 'providers',
            children: [
              {
                path: '',
                element: (
                  <RequireWorkspace>
                    <ProvidersPage />
                  </RequireWorkspace>
                ),
              },
              {
                path: 'create',
                element: (
                  <RequireWorkspace>
                    <CreateProviderPage />
                  </RequireWorkspace>
                ),
              },
              {
                path: ':id',
                element: (
                  <RequireWorkspace>
                    <DetailProvider />
                  </RequireWorkspace>
                ),
              },
              {
                path: ':id/edit',
                element: (
                  <RequireWorkspace>
                    <EditProviderPage />
                  </RequireWorkspace>
                ),
              },
            ],
          },
          {
            path: 'issues',
            children: [
              {
                path: '',
                element: (
                  <RequireWorkspace>
                    <Issues />
                  </RequireWorkspace>
                ),
              },
              {
                path: 'create',
                element: (
                  <RequireWorkspace>
                    <CreateIssue />
                  </RequireWorkspace>
                ),
              },
              {
                path: ':id',
                element: (
                  <RequireWorkspace>
                    <IssueDetail />
                  </RequireWorkspace>
                ),
              },
            ],
          },
          {
            path: 'agents',
            children: [
              {
                path: '',
                element: (
                  <RequireWorkspace>
                    <AgentsLandingPage />
                  </RequireWorkspace>
                ),
              },
              {
                path: 'providers/connect',
                element: (
                  <RequireWorkspace>
                    <ProvidersConnectPage />
                  </RequireWorkspace>
                ),
              },
              {
                path: 'create',
                element: (
                  <RequireWorkspace>
                    <CreateAgentPage />
                  </RequireWorkspace>
                ),
              },
              {
                path: 'conversations',
                children: [
                  {
                    path: '',
                    element: (
                      <RequireWorkspace>
                        <AgentConversationsPage />
                      </RequireWorkspace>
                    ),
                  },
                  {
                    path: ':conversationId',
                    element: (
                      <RequireWorkspace>
                        <AgentsChatPage />
                      </RequireWorkspace>
                    ),
                  },
                ],
              },
              {
                path: ':id',
                children: [
                  {
                    index: true,
                    element: (
                      <RequireWorkspace>
                        <AgentDetail />
                      </RequireWorkspace>
                    ),
                  },
                  {
                    path: 'edit',
                    element: (
                      <RequireWorkspace>
                        <EditAgentPage />
                      </RequireWorkspace>
                    ),
                  },
                ],
              },
            ],
          },
          {
            path: 'jobs',
            children: [
              {
                path: '',
                element: (
                  <RequireWorkspace>
                    <JobsRegistryPage />
                  </RequireWorkspace>
                ),
              },
              {
                path: 'runs/:id',
                element: (
                  <RequireWorkspace>
                    <Runs />
                  </RequireWorkspace>
                ),
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
