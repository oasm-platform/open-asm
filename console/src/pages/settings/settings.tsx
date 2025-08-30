import Page from '@/components/common/page';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEffect, type JSX } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import CreateWorkspaceDialog from '../workspaces/create-workspace-dialog';
import ListWorkspaces from './components/list-workspaces';
import { ThemeSwitcher } from './components/theme-switcher';
import UpdateUser from './components/update-user';
import ChangePassword from './components/change-password';

interface TabContentProps {
  title: string;
  description: string;
  children?: JSX.Element;
  action?: JSX.Element;
}

interface SettingsTab {
  id: string;
  label: string;
  content: TabContentProps;
  component: JSX.Element;
}

interface SettingsProps {
  defaultTab?: string;
}

const Settings = ({ defaultTab = 'account' }: SettingsProps) => {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!tab && defaultTab) {
      navigate(`/settings/${defaultTab}`, { replace: true });
    }
  }, [tab, defaultTab, navigate]);

  const handleTabChange = (value: string) => {
    navigate(`/settings/${value}`);
  };

  const settingsTabs: SettingsTab[] = [
    {
      id: 'account',
      label: 'Account',
      content: {
        title: 'Account Settings',
        description: 'Manage your account settings and preferences',
      },
      component: (
        <div className="flex gap-4 justify-between flex-col md:flex-row">
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6 w-full">
            <h4 className="font-semibold text-lg mb-4">Username</h4>
            <UpdateUser />
          </div>
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6 w-full">
            <h4 className="font-semibold text-lg mb-4">Password</h4>
            <ChangePassword />
          </div>
        </div>
      ),
    },
    {
      id: 'appearance',
      label: 'Appearance',
      content: {
        title: 'Appearance',
        description: 'Customize the look and feel of the application',
      },
      component: (
        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <ThemeSwitcher />
          </div>
        </div>
      ),
    },
    {
      id: 'workspaces',
      label: 'Workspaces',
      content: {
        title: 'Workspaces',
        description: 'Manage your workspaces and permissions',
        action: <CreateWorkspaceDialog />,
      },
      component: <ListWorkspaces />,
    },
  ];

  const currentTab = tab || defaultTab;

  return (
    <Page title="Settings">
      <div className="space-y-6">
        <Tabs
          value={currentTab}
          onValueChange={handleTabChange}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-3 max-w-lg mb-4">
            {settingsTabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {settingsTabs.map((tab) => {
            const { title, description, action } = tab.content;
            return (
              <TabsContent key={tab.id} value={tab.id} className="space-y-4">
                <div className="flex items-center flex-row justify-between">
                  <div>
                    <h3 className="text-lg font-medium">{title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {description}
                    </p>
                  </div>
                  {action}
                </div>
                {tab.component}
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </Page>
  );
};

export default Settings;

