import { useState, useEffect, useCallback } from 'react';
import { listSkills, createSkill, updateSkill, deleteSkill, type Skill } from '@/entities/skill/index.ts';
import { usePagination, PAGE_SIZE } from '@/shared/lib/usePagination.ts';

export function useSkills(projectId: string | null, pageSize = PAGE_SIZE) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { page, setPage, total, setTotal, totalPages, offset } = usePagination(pageSize);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const { items, total: t } = await listSkills(projectId, { limit: pageSize, offset });
      setSkills(items);
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

  const create = useCallback(async (data: {
    title: string;
    description?: string;
    steps?: string[];
    triggers?: string[];
    inputHints?: string[];
    filePatterns?: string[];
    tags?: string[];
    source?: 'user' | 'learned';
    confidence?: number;
  }) => {
    if (!projectId) return;
    await createSkill(projectId, data);
    refresh();
  }, [projectId, refresh]);

  const update = useCallback(async (skillId: string, data: Partial<Pick<Skill, 'title' | 'description' | 'steps' | 'triggers' | 'inputHints' | 'filePatterns' | 'tags' | 'source' | 'confidence'>>) => {
    if (!projectId) return;
    const skill = await updateSkill(projectId, skillId, data);
    setSkills((prev) => prev.map((s) => (s.id === skillId ? skill : s)));
    return skill;
  }, [projectId]);

  const remove = useCallback(async (skillId: string) => {
    if (!projectId) return;
    await deleteSkill(projectId, skillId);
    refresh();
  }, [projectId, refresh]);

  return { skills, total, page, setPage, totalPages, loading, error, refresh, create, update, remove };
}
