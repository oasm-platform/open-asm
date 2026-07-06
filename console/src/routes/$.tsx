import { createFileRoute, Link } from '@tanstack/react-router';

function NotFoundComponent() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground mt-2">Page not found</p>
      <Link to="/" className="mt-4 text-blue-500 hover:underline">
        Go home
      </Link>
    </div>
  );
}

export const Route = createFileRoute('/$')({
  component: NotFoundComponent,
});
