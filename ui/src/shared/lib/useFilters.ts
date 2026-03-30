import { useState, useEffect, useMemo, useCallback } from 'react';
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

  const [filters, setFilters] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const def of defs) {
      const urlKey = def.urlKey ?? def.key;
      initial[def.key] = searchParams.get(urlKey) || def.defaultValue;
    }
    return initial;
  });

  // Sync filters → URL params (only filter params, not sort)
  useEffect(() => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      for (const def of defs) {
        const urlKey = def.urlKey ?? def.key;
        const value = filters[def.key];
        if (value && value !== def.defaultValue) {
          next.set(urlKey, value);
        } else {
          next.delete(urlKey);
        }
      }
      return next;
    }, { replace: true });
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const setFilter = useCallback((key: K, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const clearFilter = useCallback((key: K) => {
    setFilters(prev => {
      const def = defs.find(d => d.key === key);
      return { ...prev, [key]: def?.defaultValue ?? '' };
    });
  }, [defs]);

  const clearAll = useCallback(() => {
    const cleared: Record<string, string> = {};
    for (const def of defs) {
      cleared[def.key] = def.defaultValue;
    }
    setFilters(cleared);
  }, [defs]);

  const activeFilterKeys = useMemo(() => {
    return defs
      .filter(def => filters[def.key] !== def.defaultValue)
      .map(def => def.key) as K[];
  }, [filters, defs]);

  const hasActiveFilters = activeFilterKeys.length > 0;

  return { filters: filters as Record<K, string>, setFilter, clearFilter, clearAll, hasActiveFilters, activeFilterKeys };
}
