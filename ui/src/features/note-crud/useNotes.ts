import { useState, useEffect, useCallback } from 'react';
import { listNotes, createNote, updateNote, deleteNote, type Note } from '@/entities/note/index.ts';
import { usePagination, PAGE_SIZE } from '@/shared/lib/usePagination.ts';

export function useNotes(projectId: string | null, pageSize = PAGE_SIZE) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { page, setPage, total, setTotal, totalPages, offset } = usePagination(pageSize);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const { items, total: t } = await listNotes(projectId, { limit: pageSize, offset });
      setNotes(items);
      setTotal(t);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId, pageSize, offset, setTotal]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(async (data: { title: string; content: string; tags?: string[] }) => {
    if (!projectId) return;
    await createNote(projectId, data);
    refresh();
  }, [projectId, refresh]);

  const update = useCallback(async (noteId: string, data: { title?: string; content?: string; tags?: string[] }) => {
    if (!projectId) return;
    const note = await updateNote(projectId, noteId, data);
    setNotes((prev) => prev.map((n) => (n.id === noteId ? note : n)));
    return note;
  }, [projectId]);

  const remove = useCallback(async (noteId: string) => {
    if (!projectId) return;
    await deleteNote(projectId, noteId);
    refresh();
  }, [projectId, refresh]);

  return { notes, total, page, setPage, totalPages, loading, error, refresh, create, update, remove };
}
