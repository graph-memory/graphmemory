import { useState, useCallback } from 'react';
import { COLUMNS, type TaskStatus } from '@/entities/task/index.ts';

const STORAGE_KEY = 'kanban-visible-columns';
const ALL_STATUSES = COLUMNS.map(c => c.status);

function loadVisible(): Set<TaskStatus> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: string[] = JSON.parse(raw);
      const valid = parsed.filter(s => ALL_STATUSES.includes(s as TaskStatus));
      if (valid.length > 0) return new Set(valid as TaskStatus[]);
    }
  } catch { /* ignore corrupt data */ }
  return new Set(ALL_STATUSES);
}

export function useColumnVisibility() {
  const [visible, setVisible] = useState<Set<TaskStatus>>(loadVisible);

  const toggle = useCallback((status: TaskStatus) => {
    setVisible(prev => {
      const next = new Set(prev);
      if (next.has(status)) {
        if (next.size <= 1) return prev;
        next.delete(status);
      } else {
        next.add(status);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const visibleColumns = COLUMNS.filter(c => visible.has(c.status));

  return { visible, toggle, visibleColumns };
}
