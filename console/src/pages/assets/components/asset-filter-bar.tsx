import { useEffect, useRef, useState } from 'react';
import { FilterToolbar } from '@/components/filter-builder/filter-toolbar';
import { DatePickerWithRange } from '@/components/ui/date-picker-range';
import useDebounce from '@/hooks/use-debounce';
import { ASSET_FILTER_FIELDS } from '../asset-filter-fields';
import { useAsset } from '../context/asset-context';

export default function AssetFilterBar() {
  const {
    tableParams: { filter },
    tableHandlers: { setFilter },
    appliedFilter,
    setAppliedFilter,
    dateRange,
    setDateRange,
  } = useAsset();
  const [search, setSearch] = useState(filter ?? '');
  const debounced = useDebounce(search, 500);
  // setFilter changes identity with the URL filter; depending on it would re-write stale debounced text.
  const setFilterRef = useRef(setFilter);
  setFilterRef.current = setFilter;
  useEffect(() => {
    setFilterRef.current(debounced);
  }, [debounced]);
  useEffect(() => {
    setSearch(filter ?? ''); // cleared when a tree is applied
  }, [filter]);

  return (
    <div className="flex w-full flex-col gap-2 md:flex-row md:items-center">
      <FilterToolbar fields={ASSET_FILTER_FIELDS} value={appliedFilter} onApply={(f) => {
          if (f?.items.length) setSearch(''); // drop pending search so it isn't written behind the tree
          setAppliedFilter(f);
        }}
        search={search} onSearchChange={setSearch} />
      <DatePickerWithRange label="Date" value={dateRange} onChange={setDateRange} className="w-full md:w-60" />
    </div>
  );
}
