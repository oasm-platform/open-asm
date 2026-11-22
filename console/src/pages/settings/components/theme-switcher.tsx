import { Card, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTheme, type Theme } from '@/components/ui/theme-provider';
import { Monitor, Moon, PaletteIcon, Sun } from 'lucide-react';
import { useT } from '@/lib/i18n-dictionary';

export function ThemeSwitcher() {
  const t = useT();
  const { theme, setTheme } = useTheme();

  return (
    <Card className="p-4">
      <CardTitle>{t('settings.appearance.title')}</CardTitle>
      <div className="flex items-center justify-between">
        <h4 className="font-medium flex items-center">
          <PaletteIcon className="mr-2 h-4 w-4" />
          {t('settings.appearance.theme')}
        </h4>

        <Select
          value={theme}
          onValueChange={(value) => setTheme(value as Theme)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t('settings.appearance.selectTheme')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="light">
              <div className="flex items-center gap-2">
                <Sun className="h-4 w-4" />
                <span>{t('settings.appearance.light')}</span>
              </div>
            </SelectItem>
            <SelectItem value="dark">
              <div className="flex items-center gap-2">
                <Moon className="h-4 w-4" />
                <span>{t('settings.appearance.dark')}</span>
              </div>
            </SelectItem>
            <SelectItem value="system">
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4" />
                <span>{t('settings.appearance.system')}</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </Card>
  );
}
