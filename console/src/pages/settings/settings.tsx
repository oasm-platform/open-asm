import { usePermission } from '@/hooks/usePermission';
import { useSession } from '@/utils/authClient';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useMemo, type JSX } from 'react';
import { t, useT } from '@/lib/i18n-dictionary';
import {
  Building2,
  FileCode,
  FolderOpen,
  KeyRound,
  Loader2,
  Plug,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import ApiKeysSettings from './components/api-keys-settings';
import { Files } from '@/pages/files/files';
import Templates from '@/pages/templates/templates';
import { TemplatesHeaderActions } from '@/pages/templates/components/templates-header-actions';
import AuditLogSettings from './components/audit-log-settings';
import McpConnect from './components/mcp-connect';
import MembersSettings from './components/members-settings';
import Preferences from './components/preferences';
import SecuritySettings from './components/security-settings';
import VulnerabilityManagementSettings from './components/vulnerability-management-settings';
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
  icon: JSX.Element;
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

// Settings tab groups with content and component - exported for SettingsLayout.
// Labels are getters so they read the active language on every access.
export const settingsTabGroups: SettingsTabGroup[] = [
  {
    get name() {
      return t('settings.groups.workspace');
    },
    tabs: [
      {
        id: 'general',
        get label() {
          return t('settings.tabs.general.label');
        },
        path: '/settings/general',
        icon: <Building2 />,
        content: {
          get title() {
            return t('settings.tabs.general.title');
          },
          get description() {
            return t('settings.tabs.general.description');
          },
        },
        component: <WorkspaceSettings />,
        permission: 'workspace.read',
      },
      {
        id: 'apikeys',
        get label() {
          return t('settings.tabs.apikeys.label');
        },
        path: '/settings/apikeys',
        icon: <KeyRound />,
        content: {
          get title() {
            return t('settings.tabs.apikeys.title');
          },
          get description() {
            return t('settings.tabs.apikeys.description');
          },
        },
        component: <ApiKeysSettings />,
        permission: 'workspace.apikey',
      },
      {
        id: 'members',
        get label() {
          return t('settings.tabs.members.label');
        },
        path: '/settings/members',
        icon: <Users />,
        content: {
          get title() {
            return t('settings.tabs.members.title');
          },
          get description() {
            return t('settings.tabs.members.description');
          },
        },
        component: <MembersSettings />,
        permission: 'member.read',
      },
      {
        id: 'audit',
        get label() {
          return t('settings.tabs.audit.label');
        },
        path: '/settings/audit',
        icon: <ScrollText />,
        content: {
          get title() {
            return t('settings.tabs.audit.title');
          },
          get description() {
            return t('settings.tabs.audit.description');
          },
        },
        component: <AuditLogSettings />,
        permission: 'audit.read',
      },
      {
        id: 'files',
        get label() {
          return t('settings.tabs.files.label');
        },
        path: '/settings/files',
        icon: <FolderOpen />,
        content: {
          get title() {
            return t('settings.tabs.files.title');
          },
          get description() {
            return t('settings.tabs.files.description');
          },
        },
        component: <Files />,
        permission: 'artifact.read',
      },
      {
        id: 'templates',
        get label() {
          return t('settings.tabs.templates.label');
        },
        path: '/settings/templates',
        icon: <FileCode />,
        content: {
          get title() {
            return t('settings.tabs.templates.title');
          },
          get description() {
            return t('settings.tabs.templates.description');
          },
          action: <TemplatesHeaderActions />,
        },
        component: <Templates />,
        permission: 'artifact.read',
      },
      {
        id: 'vulnerability-management',
        get label() {
          return t('settings.tabs.vulnerabilityManagement.label');
        },
        path: '/settings/vulnerability-management',
        icon: <ShieldAlert />,
        content: {
          get title() {
            return t('settings.tabs.vulnerabilityManagement.title');
          },
          get description() {
            return t('settings.tabs.vulnerabilityManagement.description');
          },
        },
        component: <VulnerabilityManagementSettings />,
        permission: 'vulnerability.read',
      },
    ],
  },
  // Group: Account Settings
  {
    get name() {
      return t('settings.groups.account');
    },
    tabs: [
      {
        id: 'preferences',
        get label() {
          return t('settings.tabs.preferences.label');
        },
        path: '/settings/preferences',
        icon: <SlidersHorizontal />,
        content: {
          get title() {
            return t('settings.tabs.preferences.title');
          },
          get description() {
            return t('settings.tabs.preferences.description');
          },
        },
        component: <Preferences />,
      },
      {
        id: 'security',
        get label() {
          return t('settings.tabs.security.label');
        },
        path: '/settings/security',
        icon: <ShieldCheck />,
        content: {
          get title() {
            return t('settings.tabs.security.title');
          },
          get description() {
            return t('settings.tabs.security.description');
          },
        },
        component: <SecuritySettings />,
      },
    ],
  },
  // // Group: Integration
  {
    get name() {
      return t('settings.groups.integration');
    },
    tabs: [
      {
        id: 'mcp',
        get label() {
          return t('settings.tabs.mcp.label');
        },
        path: '/settings/mcp',
        icon: <Plug />,
        content: {
          get title() {
            return t('settings.tabs.mcp.title');
          },
          get description() {
            return t('settings.tabs.mcp.description');
          },
        },
        component: <McpConnect />,
        permission: 'workspace.apikey',
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
          !tab.permission ||
          (hasPermission ? hasPermission(tab.permission) : false),
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
  const tr = useT();

  const visibleTabs = useMemo(
    () =>
      filterTabGroups(settingsTabGroups, {
        userRole: data?.user.role,
        hasPermission,
      }).flatMap((group) =>
        group.tabs.map((t) => ({ ...t, group: group.name })),
      ),
    // tr: re-read the getter labels after a language switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data?.user.role, hasPermission, tr],
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
  const activeTab =
    visibleTabs.find((t) => t.id === currentTab) || visibleTabs[0];

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className={
        activeTab?.id === 'templates'
          ? 'w-full'
          : activeTab?.id === 'audit' || activeTab?.id === 'files'
            ? 'mx-auto w-full sm:w-5/6 xl:w-2/3'
            : 'mx-auto w-full sm:w-3/4 xl:w-1/2'
      }
    >
      {activeTab && (
        <div className="space-y-4">
          <div className="flex flex-row items-center justify-between gap-4">
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
