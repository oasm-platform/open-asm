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

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <Card className="p-4">
      <CardTitle>Appearance</CardTitle>
      <div className="flex items-center justify-between">
        <h4 className="font-medium flex items-center">
          <PaletteIcon className="mr-2 h-4 w-4" />
          Theme
        </h4>

        <Select
          value={theme}
          onValueChange={(value) => setTheme(value as Theme)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Select theme" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="light">
              <div className="flex items-center gap-2">
                <Sun className="h-4 w-4" />
                <span>Light</span>
              </div>
            </SelectItem>
            <SelectItem value="dark">
              <div className="flex items-center gap-2">
                <Moon className="h-4 w-4" />
                <span>Dark</span>
              </div>
            </SelectItem>
            <SelectItem value="system">
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4" />
                <span>System</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </Card>
  );
}
