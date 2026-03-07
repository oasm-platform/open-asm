import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Home, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';

const NotFound = () => {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="flex flex-col items-center gap-3 pb-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <TriangleAlert className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle className="text-4xl font-bold tracking-tight">
            404
          </CardTitle>
          <CardDescription className="text-base">
            Page Not Found
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-4">
          <p className="text-sm text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </CardContent>
        <CardFooter className="flex justify-center gap-4">
          <Link to="/" className="text-decoration-none">
            <Button variant="default" className="gap-2">
              <Home className="h-4 w-4" />
              Go back home
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
};

export default NotFound;
