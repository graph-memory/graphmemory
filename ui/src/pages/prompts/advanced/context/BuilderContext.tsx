import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import type { MegaBuilderState } from '../types.ts';
import { createDefaultState } from '../defaults.ts';
import { builderReducer, type BuilderAction } from './builderReducer.ts';

interface BuilderContextValue {
  state: MegaBuilderState;
  dispatch: Dispatch<BuilderAction>;
}

const BuilderContext = createContext<BuilderContextValue | null>(null);

export function BuilderProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(builderReducer, null, createDefaultState);

  return (
    <BuilderContext.Provider value={{ state, dispatch }}>
      {children}
    </BuilderContext.Provider>
  );
}

export function useBuilderContext(): BuilderContextValue {
  const ctx = useContext(BuilderContext);
  if (!ctx) throw new Error('useBuilderContext must be used within BuilderProvider');
  return ctx;
}
