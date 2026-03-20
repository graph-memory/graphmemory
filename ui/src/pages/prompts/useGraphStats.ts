import { useState, useEffect } from 'react';
import { getProjectStats, type ProjectDetailedStats } from '@/entities/project/api.ts';
import { ALL_GRAPHS } from '@/content/prompts/index.ts';
import type { GraphStats } from './prompt-builder.ts';

export function useGraphStats(projectId: string | undefined) {
  const [graphStats, setGraphStats] = useState<GraphStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);
    getProjectStats(projectId)
      .then(stats => {
        if (cancelled) return;
        const s = stats as ProjectDetailedStats;
        setGraphStats([
          { name: 'docs', nodeCount: s.docs?.nodes ?? 0, available: (s.docs?.nodes ?? 0) > 0 },
          { name: 'code', nodeCount: s.code?.nodes ?? 0, available: (s.code?.nodes ?? 0) > 0 },
          { name: 'files', nodeCount: s.fileIndex?.nodes ?? 0, available: (s.fileIndex?.nodes ?? 0) > 0 },
          { name: 'knowledge', nodeCount: s.knowledge?.nodes ?? 0, available: (s.knowledge?.nodes ?? 0) > 0 },
          { name: 'tasks', nodeCount: s.tasks?.nodes ?? 0, available: (s.tasks?.nodes ?? 0) > 0 },
          { name: 'skills', nodeCount: s.skills?.nodes ?? 0, available: (s.skills?.nodes ?? 0) > 0 },
        ]);
      })
      .catch(() => {
        if (cancelled) return;
        setGraphStats(ALL_GRAPHS.map(name => ({ name, nodeCount: 0, available: false })));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  return { graphStats, loading };
}
