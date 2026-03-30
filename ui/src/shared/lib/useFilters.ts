import { useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface FilterDef {
  key: string;
  defaultValue: string;
  urlKey?: string;
}

export interface UseFiltersResult<K extends string = string> {
  filters: Record<K, string>;
  setFilter: (key: K, value: string) => void;
  clearFilter: (key: K) => void;
  clearAll: () => void;
  hasActiveFilters: boolean;
  activeFilterKeys: K[];
}

export function useFilters<K extends string = string>(defs: FilterDef[]): UseFiltersResult<K> {
  const [searchParams, setSearchParams] = useSearchParams();
  const defsRef = useRef(defs);
  defsRef.current = defs;

  // Read filters directly from URL — single source of truth
  const filters = useMemo(() => {
    const result: Record<string, string> = {};
    for (const def of defs) {
      const urlKey = def.urlKey ?? def.key;
      result[def.key] = searchParams.get(urlKey) || def.defaultValue;
    }
    return result;
  }, [searchParams, defs]);

  const updateUrl = useCallback((updates: Record<string, string>) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      for (const def of defsRef.current) {
        const urlKey = def.urlKey ?? def.key;
        const value = updates[def.key] ?? prev.get(urlKey) ?? def.defaultValue;
        if (value && value !== def.defaultValue) {
          next.set(urlKey, value);
        } else {
          next.delete(urlKey);
        }
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setFilter = useCallback((key: K, value: string) => {
    updateUrl({ [key]: value });
  }, [updateUrl]);

  const clearFilter = useCallback((key: K) => {
    const def = defsRef.current.find(d => d.key === key);
    updateUrl({ [key]: def?.defaultValue ?? '' });
  }, [updateUrl]);

  const clearAll = useCallback(() => {
    const cleared: Record<string, string> = {};
    for (const def of defsRef.current) {
      cleared[def.key] = def.defaultValue;
    }
    updateUrl(cleared);
  }, [updateUrl]);

  const activeFilterKeys = useMemo(() => {
    return defs
      .filter(def => filters[def.key] !== def.defaultValue)
      .map(def => def.key) as K[];
  }, [filters, defs]);

  const hasActiveFilters = activeFilterKeys.length > 0;

  return { filters: filters as Record<K, string>, setFilter, clearFilter, clearAll, hasActiveFilters, activeFilterKeys };
}
