// hooks/usePersistedTab.ts
import { useEffect, useRef } from 'react';
import { AppTab } from '../types';

const HIDDEN_TABS = new Set(['LEADS', 'ACQUISITION']);

export const usePersistedTab = (
  activeTab: AppTab,
  setActiveTab: (tab: AppTab) => void
) => {
  const isFirstRender = useRef(true);

  // 🔹 Carrega aba persistida ao iniciar
  useEffect(() => {
    const lastTab = localStorage.getItem('cm_last_tab');
    if (lastTab && typeof lastTab === 'string') {
      if (HIDDEN_TABS.has(lastTab)) {
        localStorage.removeItem('cm_last_tab');
        setActiveTab('DASHBOARD');
        return;
      }
      setActiveTab(lastTab as AppTab);
    }
  }, []); // Remove setActiveTab from dependencies to prevent infinite loops

  // 🔹 Salva sempre que a aba mudar (mas evita salvar na primeira renderização)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (activeTab && !HIDDEN_TABS.has(activeTab)) {
      localStorage.setItem('cm_last_tab', activeTab);
    }
  }, [activeTab]);
};
