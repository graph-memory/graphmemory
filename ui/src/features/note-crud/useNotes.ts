import { useState, useEffect, useCallback } from 'react';
import { listNotes, createNote, updateNote, deleteNote, type Note } from '@/entities/note/index.ts';

export function useNotes(projectId: string | null) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listNotes(projectId);
      setNotes(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(async (data: { title: string; content: string; tags?: string[] }) => {
    if (!projectId) return;
    const note = await createNote(projectId, data);
    setNotes((prev) => [...prev, note]);
    return note;
  }, [projectId]);

  const update = useCallback(async (noteId: string, data: { title?: string; content?: string; tags?: string[] }) => {
    if (!projectId) return;
    const note = await updateNote(projectId, noteId, data);
    setNotes((prev) => prev.map((n) => (n.id === noteId ? note : n)));
    return note;
  }, [projectId]);

  const remove = useCallback(async (noteId: string) => {
    if (!projectId) return;
    await deleteNote(projectId, noteId);
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  }, [projectId]);

  return { notes, loading, error, refresh, create, update, remove };
}
