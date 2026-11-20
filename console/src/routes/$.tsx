import { useT } from '@/lib/i18n-dictionary';
import { createFileRoute, Link } from '@tanstack/react-router';

function NotFoundComponent() {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground mt-2">{t('shell.notFound.title')}</p>
      <Link to="/" className="mt-4 text-blue-500 hover:underline">
        {t('shell.notFound.goHome')}
      </Link>
    </div>
  );
}

export const Route = createFileRoute('/$')({
  component: NotFoundComponent,
});
