
import { useCallback, useState, useRef, useEffect } from 'react';
import { AppTab } from '../types';

const HUB_TABS: AppTab[] = ['DOSSIER', 'SOURCES', 'LEGAL', 'PROFILE', 'SETTINGS', 'CLIENTS'];

/**
 * Hook central de navegação com STACK REAL.
 * Gerencia o histórico de abas para permitir o retorno correto.
 */
export const useNavigationStack = (
  activeTab: AppTab,
  setActiveTab: (tab: AppTab) => void,
  openNavHub: () => void
) => {
  const [stack, setStack] = useState<AppTab[]>(['DASHBOARD']);

  // Sincroniza a stack quando a aba muda externamente
  useEffect(() => {
    setStack(prev => {
      if (prev[prev.length - 1] === activeTab) return prev;
      return [...prev, activeTab];
    });
  }, [activeTab]);

  const goBack = useCallback(() => {
    // Se está em uma aba do Hub → abre o Hub Central (NavHub)
    if (HUB_TABS.includes(activeTab)) {
      openNavHub();
      return;
    }

    // Caso contrário, tenta voltar na stack
    if (stack.length > 1) {
      const newStack = [...stack];
      newStack.pop(); // Remove a atual
      const prevTab = newStack[newStack.length - 1];
      setStack(newStack);
      setActiveTab(prevTab);
    } else {
      setActiveTab('DASHBOARD');
    }
  }, [activeTab, stack, setActiveTab, openNavHub]);

  const isInHub = HUB_TABS.includes(activeTab);

  const goBackPage = useCallback(() => {
    if (activeTab === 'DASHBOARD') return;
    const previous = stack.length > 1 ? stack.slice(0, -1) : ['DASHBOARD' as AppTab];
    setStack(previous);
    setActiveTab(previous[previous.length - 1]);
  }, [activeTab, stack, setActiveTab]);

  return { goBack, goBackPage, isInHub };
};
