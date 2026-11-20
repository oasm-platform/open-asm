import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { OpenLink } from '@/components/ui/open-link';
import { useBugReportUrl } from '@/hooks/use-bug-report-url';
import { saveAccountLanguage } from '@/lib/account-language';
import {
  nativeName,
  prefetchLanguages,
  useSupportedLanguages,
  useT,
} from '@/lib/i18n-dictionary';
import { isAdminUser } from '@/modules/admin/utils';
import { useRootControllerGetMetadata } from '@/services/apis/gen/queries';
import {
  authClient,
  markVoluntaryLogout,
  type User,
} from '@/utils/authClient';
import { useLanguage } from '@/utils/languageState';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  BookOpen,
  Bug,
  Languages,
  LogOut,
  Settings,
  ShieldUser,
} from 'lucide-react';

interface NavUserProps {
  isOnlyAvatar?: boolean;
  dropdownSide?: 'top' | 'bottom' | 'left' | 'right';
}

function LanguageMenu() {
  const t = useT();
  const lang = useLanguage();
  const queryClient = useQueryClient();
  const { data: languages } = useSupportedLanguages();
  const options = languages?.length ? languages : [lang];

  const select = (code: string) => {
    // Let the menu start closing before the page re-renders in the new language.
    requestAnimationFrame(() => {
      void saveAccountLanguage(code).then(() =>
        // Only notifications are rendered server-side in the request language.
        queryClient.invalidateQueries({
          predicate: (q) =>
            String(q.queryKey[0]).startsWith('/api/notifications'),
        }),
      );
    });
  };

  return (
    <DropdownMenuSub
      onOpenChange={(open) => open && prefetchLanguages(options)}
    >
      <DropdownMenuSubTrigger>
        <Languages />
        <span className="flex-1">{t('ui.userMenu.language')}</span>
        <span className="text-muted-foreground text-xs">
          {nativeName(lang)}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-40">
        <DropdownMenuRadioGroup value={lang} onValueChange={select}>
          {options.map((code) => (
            <DropdownMenuRadioItem key={code} value={code} lang={code}>
              {nativeName(code)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export function NavUser({ isOnlyAvatar = false, dropdownSide }: NavUserProps) {
  const { isMobile } = useSidebar();
  const { useSession, signOut } = authClient;
  const navigate = useNavigate();
  const { data: session } = useSession();
  const { data: metadata } = useRootControllerGetMetadata();
  const bugReportUrl = useBugReportUrl();
  const t = useT();
  const user = session?.user;
  if (!user) {
    return <></>;
  }

  const handleLogout = async () => {
    markVoluntaryLogout();
    await signOut({
      fetchOptions: {
        onSuccess: async () => {
          // The cache and the selected workspace are dropped by AppRouter
          // once the session store empties, after _authed has unmounted.
          await navigate({ to: '/login' });
        },
        onError: (ctx) => {
          console.error('Logout failed:', ctx.error);
        },
      },
    });
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg grayscale">
                <AvatarImage src={user?.image || ''} alt={user.name} />
                <AvatarFallback className="rounded-lg">
                  {user.name?.charAt(0).toUpperCase() || '?'}
                </AvatarFallback>
              </Avatar>
              {!isOnlyAvatar && (
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {user.email}
                  </span>
                </div>
              )}
              {/* <IconDotsVertical className="ml-auto size-4" /> */}
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={dropdownSide ?? (isMobile ? 'bottom' : 'right')}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user?.image || ''} alt={user.name} />
                  <AvatarFallback className="rounded-lg">
                    {user.name?.charAt(0).toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {user.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => navigate({ to: '/settings' })}>
                <Settings />
                {t('ui.userMenu.settings')}
              </DropdownMenuItem>
              {isAdminUser(user as User) && (
                <DropdownMenuItem onClick={() => navigate({ to: '/admin' })}>
                  <ShieldUser />
                  {t('ui.userMenu.admin')}
                </DropdownMenuItem>
              )}
              <LanguageMenu />
            </DropdownMenuGroup>
            {(metadata?.docsUrl || bugReportUrl) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  {metadata?.docsUrl && (
                    <DropdownMenuItem asChild>
                      <OpenLink
                        href={metadata.docsUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        <BookOpen />
                        {t('ui.userMenu.docs')}
                      </OpenLink>
                    </DropdownMenuItem>
                  )}
                  {bugReportUrl && (
                    <DropdownMenuItem asChild>
                      <OpenLink
                        href={bugReportUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        <Bug />
                        {t('ui.userMenu.reportIssue')}
                      </OpenLink>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut />
              {t('ui.userMenu.logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
