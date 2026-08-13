// hooks/usePersistedTab.ts
import { useEffect, useRef } from 'react';
import { AppTab } from '../types';

const VALID_TABS = new Set<AppTab>([
  'DASHBOARD', 'DOSSIER', 'CLIENTS', 'LEGAL', 'SOURCES', 'PROFILE', 'SETTINGS',
  'CONTRACT_DETAILS', 'SIMULATOR', 'FLOW', 'LEGAL_DOCUMENT_EDITOR',
  'EXTRATO', 'SUPPORT', 'REPORTS',
]);

export const usePersistedTab = (
  activeTab: AppTab,
  setActiveTab: (tab: AppTab) => void
) => {
  const isFirstRender = useRef(true);

  // 🔹 Carrega aba persistida ao iniciar
  useEffect(() => {
    const lastTab = localStorage.getItem('cm_last_tab');
    if (lastTab && typeof lastTab === 'string') {
      if (!VALID_TABS.has(lastTab as AppTab)) {
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

    if (activeTab && VALID_TABS.has(activeTab)) {
      localStorage.setItem('cm_last_tab', activeTab);
    }
  }, [activeTab]);
};
