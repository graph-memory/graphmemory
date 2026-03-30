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
  /** Set multiple filters atomically (single URL update) */
  setFilters: (updates: Partial<Record<K, string>>) => void;
  clearFilter: (key: K) => void;
  clearAll: () => void;
  hasActiveFilters: boolean;
  activeFilterKeys: K[];
}

export function useFilters<K extends string = string>(defs: FilterDef[]): UseFiltersResult<K> {
  const [searchParams, setSearchParams] = useSearchParams();
  const defsRef = useRef(defs);
  defsRef.current = defs;

  // Managed filter keys — these are owned by useFilters
  const managedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const def of defs) s.add(def.urlKey ?? def.key);
    return s;
  }, [defs]);
  const managedKeysRef = useRef(managedKeys);
  managedKeysRef.current = managedKeys;

  // Read filters directly from URL — single source of truth
  const filters = useMemo(() => {
    const result: Record<string, string> = {};
    for (const def of defs) {
      const urlKey = def.urlKey ?? def.key;
      result[def.key] = searchParams.get(urlKey) || def.defaultValue;
    }
    return result;
  }, [searchParams, defs]);

  // Core URL updater — only touches managed filter keys, preserves everything else
  const updateUrl = useCallback((updates: Record<string, string>, extraDeletes?: string[]) => {
    setSearchParams(prev => {
      const next = new URLSearchParams();
      // Copy non-managed params as-is
      for (const [k, v] of prev.entries()) {
        if (!managedKeysRef.current.has(k)) next.set(k, v);
      }
      // Apply extra deletes (for sort reset etc.)
      if (extraDeletes) {
        for (const k of extraDeletes) next.delete(k);
      }
      // Set managed filter params
      for (const def of defsRef.current) {
        const urlKey = def.urlKey ?? def.key;
        const value = def.key in updates ? updates[def.key] : prev.get(urlKey);
        if (value && value !== def.defaultValue) {
          next.set(urlKey, value);
        }
        // else: don't set = effectively deleted
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setFilter = useCallback((key: K, value: string) => {
    updateUrl({ [key]: value });
  }, [updateUrl]);

  const setFilters = useCallback((updates: Partial<Record<K, string>>) => {
    updateUrl(updates as Record<string, string>);
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

  return { filters: filters as Record<K, string>, setFilter, setFilters, clearFilter, clearAll, hasActiveFilters, activeFilterKeys };
}
