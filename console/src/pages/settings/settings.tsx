import { useEffect, useMemo, type JSX } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSession } from '@/utils/authClient';
import ApiKeysSettings from './components/api-keys-settings';
import BrandNameAndLogoSettings from './components/brand-name-and-logo';
import CreateMcpPermission from './components/create-mcp-permission';
import GetAboutProject from './components/get-about-project';
import ListMcpPermissions from './components/list-mcp-permissions';
import Preferences from './components/preferences';
import SecuritySettings from './components/security-settings';
import WorkspaceSettings from './components/workspace-settings';

interface TabContentProps {
  title: string;
  description: string;
  children?: JSX.Element;
  action?: JSX.Element;
}

interface SettingsTabItem {
  id: string;
  label: string;
  path: string;
  content?: TabContentProps;
  component?: JSX.Element;
}

interface SettingsTabGroup {
  name: string;
  tabs: SettingsTabItem[];
  roles?: string[];
}

interface SettingsProps {
  defaultTab?: string;
}

// Settings tab groups with content and component - exported for SettingsLayout
export const settingsTabGroups: SettingsTabGroup[] = [
  {
    name: 'Configuration',
    tabs: [
      {
        id: 'workspace',
        label: 'Workspace',
        path: '/settings/workspace',
        content: {
          title: 'Workspace settings',
          description: 'Manage your workspace settings',
        },
        component: <WorkspaceSettings />,
      },
      {
        id: 'apikeys',
        label: 'API Keys',
        path: '/settings/apikeys',
        content: {
          title: 'API Keys',
          description: 'Manage your workspace API keys',
        },
        component: <ApiKeysSettings />,
      },
    ],
  },
  // Group: Account Settings
  {
    name: 'Account Settings',
    tabs: [
      {
        id: 'preferences',
        label: 'Preferences',
        path: '/settings/preferences',
        content: {
          title: 'Preferences',
          description: 'Manage your account preferences',
        },
        component: <Preferences />,
      },
      {
        id: 'security',
        label: 'Security',
        path: '/settings/security',
        content: {
          title: 'Security',
          description: 'Manage your account security settings',
        },
        component: <SecuritySettings />,
      },
    ],
  },
  // Group: Integrations
  {
    name: 'Integrations',
    tabs: [
      {
        id: 'mcp',
        label: 'MCP connect',
        path: '/settings/mcp',
        content: {
          title: 'MCP Permissions',
          description: 'Manage your MCP permissions',
          action: <CreateMcpPermission />,
        },
        component: <ListMcpPermissions />,
      },
    ],
  },
  // Group: System
  {
    name: 'System',
    roles: ['admin'],
    tabs: [
      {
        id: 'brand',
        label: 'Brand name and logo',
        path: '/settings/brand',
        content: {
          title: 'Brand name and logo',
          description: 'Customize your brand name and logo',
        },
        component: <BrandNameAndLogoSettings />,
      },
      {
        id: 'about',
        label: 'About',
        path: '/settings/about',
        content: {
          title: 'About',
          description:
            'Open-source platform for cybersecurity Attack Surface Management.',
        },
        component: <GetAboutProject />,
      },
    ],
  },
];

export function filterTabGroups(
  groups: typeof settingsTabGroups,
  userRole: string | null | undefined,
): typeof settingsTabGroups {
  return groups.filter(
    (group) =>
      !group.roles ||
      group.roles.length === 0 ||
      (userRole != null && group.roles.includes(userRole)),
  );
}

// Backward compatibility - flattened array of all tabs
export const settingsTabs = settingsTabGroups.flatMap((group) => group.tabs);

const Settings = ({ defaultTab = 'workspace' }: SettingsProps) => {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const { data } = useSession();

  const visibleTabs = useMemo(
    () =>
      filterTabGroups(settingsTabGroups, data?.user.role).flatMap((group) =>
        group.tabs.map((t) => ({ ...t, group: group.name })),
      ),
    [data?.user.role],
  );

  useEffect(() => {
    if (!tab && defaultTab) {
      navigate(`/settings/${defaultTab}`, { replace: true });
    }
  }, [tab, defaultTab, navigate]);

  const currentTab = tab || defaultTab;
  const activeTab =
    visibleTabs.find((t) => t.id === currentTab) || visibleTabs[0];

  return (
    <div className="mx-auto w-full sm:w-3/4 xl:w-1/3">
      {activeTab && (
        <div className="space-y-4">
          <div className="flex items-center flex-row justify-between">
            <div>
              <h3 className="text-lg font-medium">
                {activeTab.content?.title}
              </h3>
              <p className="text-sm text-muted-foreground">
                {activeTab.content?.description}
              </p>
            </div>
            {activeTab.content?.action}
          </div>
          {activeTab.component}
        </div>
      )}
    </div>
  );
};

export default Settings;
