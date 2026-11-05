import { useEffect, useState } from 'react';

const prefix = 'capitalflow:wallet:draft:';

/** Rascunho local, por tela e usuário. Nunca usar para PAN, PIN, CVC/CVV ou tokens. */
export function useWalletDraft<T>(key: string, initial: T) {
  const storageKey = prefix + key;
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initial;
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) as T : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
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
