import { useEffect } from 'react';
import { notificationService } from '../services/notification.service';
import { pushSubscriptionService } from '../services/pushSubscription.service';
import type { UserProfile } from '../types';

/**
 * Registers web push notifications for authenticated non-public views
 * and flushes the offline write queue when connectivity is restored.
 */
export function useNetworkSync(activeUser: UserProfile | null, isPublicView: boolean) {
  useEffect(() => {
    if (activeUser && !isPublicView) {
      notificationService.requestPermission().then((granted) => {
        if (granted) {
          void pushSubscriptionService.register(activeUser.id);
        }
      });
    }
  }, [activeUser, isPublicView]);

  useEffect(() => {
    const handleOnline = async () => {
      console.log('[NETWORK] Conexão restabelecida. Processando fila de sincronização...');
      try {
        const { syncService } = await import('../services/sync.service');
        window.dispatchEvent(new CustomEvent('capitalflow:sync-requested'));
        void syncService.processQueue().catch((error) => {
          console.error('[NETWORK] Falha ao processar fila em segundo plano:', error);
        });
      } catch (e) {
        console.error('[NETWORK] Falha ao processar fila após volta da rede:', e);
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);
}
