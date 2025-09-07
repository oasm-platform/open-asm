import { useLocation, useNavigate } from 'react-router-dom';

export function useNavigateWithParams() {
  const navigate = useNavigate();
  const location = useLocation();

  return (path: string, options?: { replace?: boolean }) => {
    const search = location.search;
    navigate(path + search, options);
  };
}
