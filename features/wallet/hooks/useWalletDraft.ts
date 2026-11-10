import { useEffect, useRef, useState } from 'react';

const prefix = 'capitalflow:wallet:draft:';

function readStoredDraft<T>(storageKey: string, initial: T): T {
  if (typeof window === 'undefined') return initial;
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) as T : initial;
  } catch {
    return initial;
  }
}

/** Rascunho local, por tela e usuário. Nunca usar para PAN, PIN, CVC/CVV ou tokens. */
export function useWalletDraft<T>(key: string, initial: T, scopeId?: string | null) {
  const storageKey = scopeId ? `${prefix}${scopeId}:${key}` : `${prefix}${key}`;
  const [value, setValue] = useState<T>(() => readStoredDraft(storageKey, initial));
  const previousKeyRef = useRef(storageKey);

  useEffect(() => {
    if (previousKeyRef.current !== storageKey) {
      previousKeyRef.current = storageKey;
      setValue(readStoredDraft(storageKey, initial));
      return;
    }
    try {
      const isEmpty = JSON.stringify(value) === JSON.stringify(initial);
      if (isEmpty) window.localStorage.removeItem(storageKey);
      else window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Storage indisponível não impede o lançamento; o estado em memória segue válido.
    }
  }, [initial, storageKey, value]);

  const clear = () => {
    setValue(initial);
    try { window.localStorage.removeItem(storageKey); } catch { /* best effort */ }
  };
  return [value, setValue, clear] as const;
}
