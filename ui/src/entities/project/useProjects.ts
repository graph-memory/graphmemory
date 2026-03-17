import { useState, useEffect } from 'react';
import { listProjects, listWorkspaces, type ProjectInfo, type WorkspaceInfo } from './api.ts';

export function useProjects() {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listProjects(), listWorkspaces()])
      .then(([p, w]) => { setProjects(p); setWorkspaces(w); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { projects, workspaces, loading, error };
}
