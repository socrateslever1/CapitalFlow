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

export function PageBackProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const register = useCallback((action: BackAction) => {
    const id = Symbol('page-back');
    setEntries(current => [...current, { id, action }]);
    return () => setEntries(current => current.filter(entry => entry.id !== id));
  }, []);

  const value = React.useMemo(() => ({
    action: entries.at(-1)?.action,
    register,
  }), [entries, register]);

  return <PageBackContext.Provider value={value}>{children}</PageBackContext.Provider>;
}

export const usePageBack = () => useContext(PageBackContext);

