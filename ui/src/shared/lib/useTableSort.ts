import { useState, useCallback } from 'react';

export type SortDir = 'asc' | 'desc' | null;

export interface TableSortState<F extends string> {
  sortField: F | null;
  sortDir: SortDir;
  handleSort: (field: F) => void;
  resetSort: () => void;
}

/**
 * Three-state table sorting hook.
 * Cycle per field: asc → desc → none → asc → ...
 * Clicking a different field always starts with asc.
 */
export function useTableSort<F extends string>(
  defaultField?: F | null,
  defaultDir?: SortDir,
): TableSortState<F> {
  const [state, setState] = useState<{ field: F | null; dir: SortDir }>({
    field: defaultField ?? null,
    dir: defaultField ? (defaultDir ?? 'asc') : null,
  });

  const handleSort = useCallback((field: F) => {
    setState(prev => {
      if (prev.field !== field) return { field, dir: 'asc' };
      if (prev.dir === 'asc') return { field, dir: 'desc' };
      return { field: null, dir: null }; // desc → none
    });
  }, []);

  const resetSort = useCallback(() => {
    setState({ field: null, dir: null });
  }, []);

  return { sortField: state.field, sortDir: state.dir, handleSort, resetSort };
}
