import { ThemeSwitcher } from './theme-switcher';
import UpdateUser from './update-user';

/**
 * Preferences settings page component displaying user profile and appearance sections.
 * Each section is displayed in its own card for better organization.
 */
export default function Preferences() {
  return (
    <div className="space-y-4">
      <UpdateUser />
      <ThemeSwitcher />
    </div>
  );
}
