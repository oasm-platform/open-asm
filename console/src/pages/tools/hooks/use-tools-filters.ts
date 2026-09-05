import type { ToolsControllerGetManyToolsCategory } from '@/services/apis/gen/queries';
import useDebounce from '@/hooks/use-debounce';
import { useState } from 'react';

const SEARCH_DEBOUNCE_MS = 300;

export function useToolsFilters() {
  const [searchInput, setSearchInput] = useState('');
  const [category, setCategory] = useState<
    ToolsControllerGetManyToolsCategory | undefined
  >(undefined);

  // Trim before debouncing so trailing spaces don't create extra requests.
  const debouncedSearch = useDebounce(searchInput.trim(), SEARCH_DEBOUNCE_MS);

  return {
    searchInput,
    setSearchInput,
    category,
    setCategory,
    debouncedSearch,
  };
}
