import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authClient } from '@/utils/authClient';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { type User } from '@/utils/authClient';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  User as UserIcon,
  ShieldOff,
  ShieldCheck,
  Calendar,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';

interface UserDetailSheetProps {
  user: User | null;
  onOpenChange: (open: boolean) => void;
}
/**
 * Renders a sheet to display user details and perform actions.
 * @param user - The user to display.
 * @param onOpenChange - Function to call when the sheet is opened or closed.
 */
export function UserDetailSheet({ user, onOpenChange }: UserDetailSheetProps) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['user', user?.id],
    queryFn: () => authClient.admin.getUser({ query: { id: user!.id } }),
    enabled: !!user,
  });

  const aUser = data?.data as User | undefined;

  const { mutate: toggleBan } = useMutation({
    mutationFn: async () => {
      if (!aUser) return;
      const action = aUser.banned
        ? authClient.admin.unbanUser
        : authClient.admin.banUser;
      await action({ userId: aUser.id });
    },
    onSuccess: () => {
      toast.success(`User has been ${aUser?.banned ? 'unbanned' : 'banned'}.`);
      return queryClient.invalidateQueries({ queryKey: ['user', aUser?.id] });
    },
    onError: () => {
      toast.error('Failed to update user status.');
    },
  });

  const { mutate: setRole } = useMutation({
    mutationFn: async (role: 'admin' | 'user') => {
      if (!aUser) return;
      await authClient.admin.setRole({ userId: aUser.id, role });
    },
    onSuccess: () => {
      toast.success('User role updated.');
      return queryClient.invalidateQueries({ queryKey: ['user', aUser?.id] });
    },
    onError: () => {
      toast.error('Failed to update user role.');
    },
  });

  return (
    <Sheet open={!!user} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl w-full p-0">
        <SheetHeader className="p-6">
          <SheetTitle>User Profile</SheetTitle>
          <SheetDescription>
            View and manage user details and actions.
          </SheetDescription>
        </SheetHeader>
        {isLoading && <div className="p-6">Loading...</div>}
        {aUser && (
          <div className="grid gap-6 p-6">
            <Card className="pt-6">
              <div className="flex flex-col items-center text-center gap-4">
                <Avatar className="h-24 w-24 border">
                  <AvatarImage
                    src={aUser.image ?? undefined}
                    alt={aUser.name}
                  />
                  <AvatarFallback className="text-3xl">
                    {aUser.name[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="grid gap-1">
                  <CardTitle className="text-2xl">{aUser.name}</CardTitle>
                  <CardDescription>{aUser.email}</CardDescription>
                </div>
              </div>
              <CardContent className="mt-6">
                <Separator />
                <div className="grid gap-4 mt-6">
                  <div className="flex items-center gap-4">
                    <UserIcon className="h-5 w-5 text-muted-foreground" />
                    <p className="font-medium">Role</p>
                    <Badge className="ml-auto">{aUser.role}</Badge>
                  </div>
                  <div className="flex items-center gap-4">
                    {aUser.banned ? (
                      <ShieldOff className="h-5 w-5 text-destructive" />
                    ) : (
                      <ShieldCheck className="h-5 w-5 text-green-500" />
                    )}
                    <p className="font-medium">Status</p>
                    {aUser.banned ? (
                      <Badge variant="destructive" className="ml-auto">
                        Banned
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="ml-auto">
                        Active
                      </Badge>
                    )}
                  </div>
                  {aUser.banned && (
                    <>
                      {aUser.banReason && (
                        <div className="flex items-start gap-4">
                          <Info className="h-5 w-5 text-muted-foreground mt-1" />
                          <div className="grid gap-1">
                            <p className="font-medium">Ban Reason</p>
                            <p className="text-sm text-muted-foreground">
                              {aUser.banReason}
                            </p>
                          </div>
                        </div>
                      )}
                      {aUser.banExpires && (
                        <div className="flex items-center gap-4">
                          <Calendar className="h-5 w-5 text-muted-foreground" />
                          <div className="grid gap-1">
                            <p className="font-medium">Ban Expires</p>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(aUser.banExpires), 'PPP p')}
                            </p>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium">Manage Access</p>
                  <Button
                    variant={aUser.banned ? 'outline' : 'destructive'}
                    onClick={() => toggleBan()}
                  >
                    {aUser.banned ? 'Unban User' : 'Ban User'}
                  </Button>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <p className="font-medium">Change Role</p>
                  <Select
                    defaultValue={aUser.role}
                    onValueChange={(value) =>
                      setRole(value as 'admin' | 'user')
                    }
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="user">User</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
