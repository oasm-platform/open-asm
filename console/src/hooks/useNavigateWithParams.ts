import { useLocation, useNavigate } from '@tanstack/react-router';

export function useNavigateWithParams() {
  const navigate = useNavigate();
  const location = useLocation();

  return (path: string, options?: { replace?: boolean }) => {
    navigate({
      to: path,
      search: location.search,
      replace: options?.replace,
    });
  };
}
