import { useState, useCallback, useEffect } from 'react';
import type { MegaBuilderState } from '../types.ts';

const STORAGE_KEY = 'prompt-builder-presets';

export interface Preset {
  name: string;
  state: MegaBuilderState;
  createdAt: number;
}

function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePresets(presets: Preset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function usePresets() {
  const [presets, setPresets] = useState<Preset[]>([]);

  useEffect(() => {
    setPresets(loadPresets());
  }, []);

  const save = useCallback((name: string, state: MegaBuilderState) => {
    const next = [...presets.filter(p => p.name !== name), { name, state, createdAt: Date.now() }];
    savePresets(next);
    setPresets(next);
  }, [presets]);

  const remove = useCallback((name: string) => {
    const next = presets.filter(p => p.name !== name);
    savePresets(next);
    setPresets(next);
  }, [presets]);

  const load = useCallback((name: string): MegaBuilderState | null => {
    return presets.find(p => p.name === name)?.state ?? null;
  }, [presets]);

  return { presets, save, remove, load };
}
