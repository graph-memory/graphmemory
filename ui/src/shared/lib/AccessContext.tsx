import { createContext, useContext, type ReactNode } from 'react';
import type { GraphInfo } from '@/entities/project/api.ts';

interface AccessContextValue {
  graphs: Record<string, GraphInfo>;
  loading: boolean;
}

const AccessContext = createContext<AccessContextValue>({ graphs: {}, loading: true });

export function AccessProvider({ graphs, loading, children }: { graphs: Record<string, GraphInfo>; loading: boolean; children: ReactNode }) {
  return <AccessContext value={{ graphs, loading }}>{children}</AccessContext>;
}

export function useGraphAccess(graphName: string): { enabled: boolean; access: 'deny' | 'r' | 'rw' | null; loading: boolean } {
  const { graphs, loading } = useContext(AccessContext);
  const info = graphs[graphName];
  return { enabled: info?.enabled ?? true, access: info?.access ?? 'rw', loading };
}

export function useCanWrite(graphName: string): boolean {
  const { access } = useGraphAccess(graphName);
  return access === 'rw';
}
