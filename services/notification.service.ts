import { playNotificationSound } from '../utils/notificationSound';

export const notificationService = {
  /**
   * Solicita permissao de notificacao de forma explicita.
   */
  async requestPermission(): Promise<boolean> {
    if (!("Notification" in window)) return false;

    if (Notification.permission === "granted") return true;

    if (Notification.permission !== "denied") {
      const permission = await Notification.requestPermission();
      return permission === "granted";
    }
    return false;
  },

  /**
   * Dispara um alerta visual nativo, sem som ou vibracao.
   */
  async notify(title: string, body: string, onClick?: () => void) {
    playNotificationSound();

    if ("Notification" in window && Notification.permission === "granted") {
      try {
        if (document.hidden) {
          window.focus();
        }

        const options: NotificationOptions & { renotify?: boolean; vibrate?: number[] } = {
          body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: 'capitalflow-critical',
          renotify: false,
          requireInteraction: true,
          silent: true,
          vibrate: []
        };

        try {
          const n = new Notification(title, options);

          n.onclick = (e) => {
            e.preventDefault();
            window.focus();
            onClick?.();
            n.close();
          };
        } catch (err: any) {
          if (err.name === 'TypeError' || err.message?.includes('Illegal constructor')) {
            navigator.serviceWorker?.getRegistration().then(registration => {
              registration?.showNotification(title, options);
            });
          } else {
            throw err;
          }
        }
      } catch (e) {
        console.warn("Falha ao disparar notificacao nativa:", e);
      }
    }
  }
};
