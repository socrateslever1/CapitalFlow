import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { localDiagnostics } from '../services/localDiagnostics';
import { bindQuickAccess, quickAccessSupported, walletQuickAccess } from '../services/walletQuickAccess';

export function useMasterTools(authorizedProfile: string | null, accessResolved: boolean, screen: string) {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useEffect(() => { navigateRef.current = navigate; }, [navigate]);
  useEffect(() => localDiagnostics.setScreen(screen), [screen]);
  useEffect(() => {
    localDiagnostics.setSession(authorizedProfile);
    return () => localDiagnostics.setSession(null);
  }, [authorizedProfile]);
  useEffect(() => {
    if (!quickAccessSupported() || !accessResolved) return;
    let active = true;
    let checking = false;
    const session = bindQuickAccess(authorizedProfile);
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        await session;
        if (!active) return;
        window.dispatchEvent(new Event('capitalflow:quick-access-ready'));
        if (!authorizedProfile) return;
        const {action} = await walletQuickAccess.consumeAction();
        if (!active) return;
        if (action === 'wallet') {
          navigateRef.current('/carteira/visao-geral');
        } else if (action === 'expense' || action === 'income') {
          navigateRef.current(`/carteira?lancamento=${action}`);
        }
      } catch (error) { localDiagnostics.record('runtime', error); }
      finally { checking = false; }
    };
    void check();
    window.addEventListener('capitalflow:quick-access', check);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      active = false;
      window.removeEventListener('capitalflow:quick-access', check);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
      void bindQuickAccess(null).catch(() => {});
    };
  }, [authorizedProfile, accessResolved]);
}
