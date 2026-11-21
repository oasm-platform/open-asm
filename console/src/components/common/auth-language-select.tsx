import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { pickLanguageSignedOut } from '@/lib/account-language';
import {
  nativeName,
  prefetchLanguages,
  useSupportedLanguages,
  useT,
} from '@/lib/i18n-dictionary';
import { useLanguage } from '@/utils/languageState';
import { Languages } from 'lucide-react';

/** Language picker for the signed-out screens (login, sign-up, init admin). */
export function AuthLanguageSelect() {
  const t = useT();
  const lang = useLanguage();
  const { data: languages } = useSupportedLanguages();
  const options = languages?.length ? languages : [lang];

  return (
    <DropdownMenu onOpenChange={(open) => open && prefetchLanguages(options)}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('ui.userMenu.language')}
        >
          <Languages />
          {nativeName(lang)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuRadioGroup
          value={lang}
          onValueChange={(code) => void pickLanguageSignedOut(code)}
        >
          {options.map((code) => (
            <DropdownMenuRadioItem key={code} value={code} lang={code}>
              {nativeName(code)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
