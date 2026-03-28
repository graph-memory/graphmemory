import { useState, useEffect } from 'react';
import { listProjects } from '@/entities/project/api.ts';

const cache = new Map<string, string>();

/**
 * Returns the absolute projectDir for a given projectId.
 * Caches results across hook instances.
 */
export function useProjectDir(projectId: string | undefined): string | null {
  const [dir, setDir] = useState<string | null>(projectId ? cache.get(projectId) ?? null : null);

  useEffect(() => {
    if (!projectId) return;
    if (cache.has(projectId)) {
      setDir(cache.get(projectId)!);
      return;
    }
    listProjects()
      .then(projects => {
        for (const p of projects) cache.set(p.id, p.projectDir);
        setDir(cache.get(projectId) ?? null);
      })
      .catch(() => {});
  }, [projectId]);

  return dir;
}
