import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useQuery } from '@tanstack/react-query';
import { authClient } from '@/utils/authClient';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { User as BetterAuthUser } from 'better-auth';

interface User extends BetterAuthUser {
  role: string;
  banned: boolean;
}

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
  const { data, isLoading } = useQuery({
    queryKey: ['user', user?.id],
    queryFn: () => authClient.admin.getUser({ query: { id: user!.id } }),
    enabled: !!user,
  });

  const aUser = data?.data as User | undefined;

  return (
    <Sheet open={!!user} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>User Detail</SheetTitle>
        </SheetHeader>
        {isLoading && <div className="py-4">Loading...</div>}
        {aUser && (
          <div className="py-4 space-y-4">
            <div className="flex items-center space-x-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={aUser.image ?? undefined} alt={aUser.name} />
                <AvatarFallback>{aUser.name[0]}</AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-xl font-bold">{aUser.name}</h2>
                <p className="text-sm text-muted-foreground">{aUser.email}</p>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <span className="font-semibold">Role:</span>{' '}
                <Badge>{aUser.role}</Badge>
              </div>
              <div>
                <span className="font-semibold">Status:</span>{' '}
                {aUser.banned ? (
                  <Badge variant="destructive">Banned</Badge>
                ) : (
                  <Badge variant="secondary">Active</Badge>
                )}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
