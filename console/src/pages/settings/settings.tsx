import { usePermission } from '@/hooks/usePermission';
import { useSession } from '@/utils/authClient';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useMemo, type JSX } from 'react';
import { Loader2 } from 'lucide-react';
import ApiKeysSettings from './components/api-keys-settings';
import AuditLogSettings from './components/audit-log-settings';
import BrandNameAndLogoSettings from './components/brand-name-and-logo';
import GetAboutProject from './components/get-about-project';
import McpConnect from './components/mcp-connect';
import MembersSettings from './components/members-settings';
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
  /** Permission key required to see this tab (e.g. 'workspace.read'). Omit to always show. */
  permission?: string;
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
    name: 'Workspace',
    tabs: [
      {
        id: 'general',
        label: 'General',
        path: '/settings/general',
        content: {
          title: 'Workspace settings',
          description: 'Manage your workspace settings',
        },
        component: <WorkspaceSettings />,
        permission: 'workspace.read',
      },
      {
        id: 'apikeys',
        label: 'API keys',
        path: '/settings/apikeys',
        content: {
          title: 'API Keys',
          description: 'Manage your workspace API keys',
        },
        component: <ApiKeysSettings />,
        permission: 'workspace.apikey',
      },
      {
        id: 'members',
        label: 'Members',
        path: '/settings/members',
        content: {
          title: 'Members',
          description: 'Manage members, invitations and permission groups',
        },
        component: <MembersSettings />,
        permission: 'member.read',
      },
      {
        id: 'audit',
        label: 'Audit log',
        path: '/settings/audit',
        content: {
          title: 'Audit log',
          description: 'View and export workspace activity',
        },
        component: <AuditLogSettings />,
        permission: 'audit.read',
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
  // // Group: Integration
  {
    name: 'Integration',
    tabs: [
      {
        id: 'mcp',
        label: 'MCP Connect',
        path: '/settings/mcp',
        content: {
          title: 'MCP Connect',
          description: 'Connect to OASM server via MCP protocol',
        },
        component: <McpConnect />,
        permission: 'workspace.apikey',
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

interface FilterTabGroupsOptions {
  userRole?: string | null | undefined;
  hasPermission?: (key: string) => boolean;
}

export function filterTabGroups(
  groups: typeof settingsTabGroups,
  { userRole, hasPermission }: FilterTabGroupsOptions = {},
): typeof settingsTabGroups {
  return groups
    .map((group) => ({
      ...group,
      tabs: group.tabs.filter(
        (tab) =>
          !tab.permission || (hasPermission ? hasPermission(tab.permission) : false),
      ),
    }))
    .filter(
      (group) =>
        group.tabs.length > 0 &&
        (!group.roles ||
          group.roles.length === 0 ||
          (userRole != null && group.roles.includes(userRole))),
    );
}

// Backward compatibility - flattened array of all tabs
export const settingsTabs = settingsTabGroups.flatMap((group) => group.tabs);

const Settings = ({ defaultTab = 'general' }: SettingsProps) => {
  const { tab } = useParams({ strict: false });
  const navigate = useNavigate();
  const { data } = useSession();
  const { hasPermission, isLoading } = usePermission();

  const visibleTabs = useMemo(
    () =>
      filterTabGroups(settingsTabGroups, {
        userRole: data?.user.role,
        hasPermission,
      }).flatMap((group) => group.tabs.map((t) => ({ ...t, group: group.name }))),
    [data?.user.role, hasPermission],
  );

  useEffect(() => {
    if (isLoading) {
      return;
    }
    const target = tab ?? defaultTab;
    if (!target || !visibleTabs.some((t) => t.id === target)) {
      navigate({
        to: `/settings/${visibleTabs[0]?.id ?? 'general'}`,
        replace: true,
      });
    }
  }, [tab, defaultTab, navigate, visibleTabs, isLoading]);

  const currentTab = tab || defaultTab;
  const activeTab = visibleTabs.find((t) => t.id === currentTab) || visibleTabs[0];

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full sm:w-5/6 xl:w-2/3">
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
