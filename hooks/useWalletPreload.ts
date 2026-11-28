import { useEffect } from 'react';

type WalletPreloadOptions = {
  userId?: string;
  accessChecked: boolean;
  isPlatformSuperAdmin: boolean;
  isPublicView: boolean;
};

/** Preloads the personal wallet after the dashboard becomes usable. */
export function useWalletPreload({
  userId,
  accessChecked,
  isPlatformSuperAdmin: _isPlatformSuperAdmin,
  isPublicView,
}: WalletPreloadOptions) {
  useEffect(() => {
    if (!userId || !accessChecked || isPublicView) return;
    let cancelled = false;
    let completed = false;
    const preload = () => {
      if (cancelled || completed || document.visibilityState !== 'visible') return;
      completed = true;
      void import('../features/wallet/WalletModule').catch(() => undefined);
      void import('../features/wallet/pages/WalletOverviewPage').catch(() => undefined);
      void import('../features/wallet/services/walletRepository')
        .then(async ({ walletRepository }) => {
          void walletRepository.prefetchAccess().catch(() => undefined);
          await walletRepository.loadOverview();
          if (cancelled) return;
          void import('../features/wallet/pages/WalletCardsPage').catch(() => undefined);
          void import('../features/wallet/pages/WalletAccountsPage').catch(() => undefined);
          void import('../features/wallet/pages/WalletPayablesPage').catch(() => undefined);
          void import('../features/wallet/pages/WalletIncomePage').catch(() => undefined);
          void import('../features/wallet/pages/WalletReportPage').catch(() => undefined);
        })
        .catch(() => {
          completed = false;
        });
    };
    const timer = window.setTimeout(preload, 2500);
    const onVisibleOrOnline = () => {
      if (!completed && document.visibilityState === 'visible') preload();
    };
    document.addEventListener('visibilitychange', onVisibleOrOnline);
    window.addEventListener('online', onVisibleOrOnline);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibleOrOnline);
      window.removeEventListener('online', onVisibleOrOnline);
    };
  }, [userId, accessChecked, isPublicView]);
}
