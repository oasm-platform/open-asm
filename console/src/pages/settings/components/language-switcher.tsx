import { Card, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSupportedLanguages, useT } from '@/lib/i18n-dictionary';
import { setLanguage, useLanguage } from '@/utils/languageState';
import { useQueryClient } from '@tanstack/react-query';
import { Languages } from 'lucide-react';

/** Each language named in itself, e.g. "Tiếng Việt", "日本語". */
function nativeName(code: string) {
  try {
    return new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function LanguageSwitcher() {
  const lang = useLanguage();
  const t = useT();
  const queryClient = useQueryClient();
  const { data: languages } = useSupportedLanguages();
  const options = languages?.length ? languages : [lang];

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium flex items-center">
          <Languages className="mr-2 h-4 w-4" />
          {t('ui.preferences.language')}
        </h4>

        <Select
          value={lang}
          onValueChange={(value) => {
            setLanguage(value);
            // Server-rendered text (notifications, errors) follows Accept-Language.
            void queryClient.invalidateQueries();
          }}
        >
          <SelectTrigger className="w-40" aria-label={t('ui.preferences.language')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((code) => (
              <SelectItem key={code} value={code} lang={code}>
                {nativeName(code)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </Card>
  );
}
