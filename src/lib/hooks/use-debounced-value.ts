'use client';

import { useEffect, useState } from 'react';

/**
 * Retourne une version de `value` mise à jour uniquement après `delayMs`
 * d'inactivité. Utilisé pour dériver la preview live ReactFlow depuis le
 * state du panneau gauche sans déclencher un re-layout BFS à chaque
 * keystroke.
 *
 * Pattern standard : ref Anthropic React guide + shadcn use-debounce.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
