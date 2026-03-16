import { useState, useEffect, useCallback } from 'react';
import { listSkills, createSkill, updateSkill, deleteSkill, type Skill } from '@/entities/skill/index.ts';

export function useSkills(projectId: string | null) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listSkills(projectId);
      setSkills(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

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
    const skill = await createSkill(projectId, data);
    setSkills((prev) => [...prev, skill]);
    return skill;
  }, [projectId]);

  const update = useCallback(async (skillId: string, data: Partial<Pick<Skill, 'title' | 'description' | 'steps' | 'triggers' | 'inputHints' | 'filePatterns' | 'tags' | 'source' | 'confidence'>>) => {
    if (!projectId) return;
    const skill = await updateSkill(projectId, skillId, data);
    setSkills((prev) => prev.map((s) => (s.id === skillId ? skill : s)));
    return skill;
  }, [projectId]);

  const remove = useCallback(async (skillId: string) => {
    if (!projectId) return;
    await deleteSkill(projectId, skillId);
    setSkills((prev) => prev.filter((s) => s.id !== skillId));
  }, [projectId]);

  return { skills, loading, error, refresh, create, update, remove };
}
