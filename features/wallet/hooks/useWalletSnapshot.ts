import { useCallback, useEffect, useState } from 'react';
import { walletRepository, type WalletSnapshot } from '../services/walletRepository';

/** A shared data boundary; financial writes remain in the canonical service/RPCs. */
export function useWalletSnapshot() {
  const [data, setData] = useState<WalletSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      const snapshot = await walletRepository.load();
      setData(snapshot);
      setError('');
      return snapshot;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar a carteira.');
      throw cause;
    }
  }, []);
  useEffect(() => {
    let active = true;
    walletRepository.load().then(result => {
      if (active) { setData(result); setError(''); }
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'Falha ao carregar a carteira.');
    }).finally(() => { if (active) setLoading(false); });
    const onChange = () => {
      void walletRepository.load().then(result => {
        if (active) { setData(result); setError(''); }
      }).catch(cause => {
        if (active) setError(cause instanceof Error ? cause.message : 'Falha ao sincronizar a carteira.');
      });
    };
    window.addEventListener('capitalflow:wallet-updated', onChange);
    return () => {
      active = false;
      window.removeEventListener('capitalflow:wallet-updated', onChange);
    };
  }, []);
  return { data, loading, error, refresh };
}