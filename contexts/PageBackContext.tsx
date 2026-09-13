import React, { createContext, useCallback, useContext, useState } from 'react';

type BackAction = {
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
};
type Entry = { id: symbol; action: BackAction };

const PageBackContext = createContext<{
  action?: BackAction;
  register: (action: BackAction) => () => void;
} | null>(null);

// Uma subpágina fornece sua própria ação ao cabeçalho, sem duplicar o botão.
export function PageBackProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const register = useCallback((action: BackAction) => {
    const id = Symbol('page-back');
    setEntries(current => [...current, { id, action }]);
    return () => setEntries(current => current.filter(entry => entry.id !== id));
  }, []);
  return <PageBackContext.Provider value={{ action: entries.at(-1)?.action, register }}>{children}</PageBackContext.Provider>;
}

export const usePageBack = () => useContext(PageBackContext);
