import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useState } from 'react';
import ChangePassword from './change-password';
import UpdateUser from './update-user';

export default function AccountSettings() {
  const [accountTab, setAccountTab] = useState('profile');

  return (
    <div className="rounded-lg border p-4">
      <div className="flex gap-8">
        {/* Vertical tabs for account settings */}
        <Tabs value={accountTab} onValueChange={setAccountTab} orientation="vertical" className="w-56">
          <TabsList className="flex flex-col h-auto bg-transparent gap-1 p-0 w-full">
            <TabsTrigger
              value="profile"
              className="w-full justify-start data-[state=active]:bg-muted data-[state=active]:text-foreground"
            >
              Profile
            </TabsTrigger>
            <TabsTrigger
              value="security"
              className="w-full justify-start data-[state=active]:bg-muted data-[state=active]:text-foreground"
            >
              Security
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Content area */}
        <div className="flex-1 max-w-md">
          <Tabs value={accountTab} onValueChange={setAccountTab}>
            <TabsContent value="profile" className="mt-0 border-0 shadow-none p-0">
              <div>
                <UpdateUser />
              </div>
            </TabsContent>
            <TabsContent value="security" className="mt-0 border-0 shadow-none p-0">
              <div>
                <h4 className="font-semibold text-lg mb-4">Password</h4>
                <ChangePassword />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}