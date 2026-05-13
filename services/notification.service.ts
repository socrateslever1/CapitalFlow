
import { playNotificationSound } from '../utils/notificationSound';

export const notificationService = {
  /**
   * Solicita permissão de notificação de forma explícita.
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
   * Dispara um alerta nativo de Extrema Importância.
   */
  async notify(title: string, body: string, onClick?: () => void) {
    // 1. Som de Alerta (Sempre toca, independente da permissão visual)
    playNotificationSound();

    // 2. Notificação Visual Nativa
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        // Tenta focar a janela se estiver oculta
        if (document.hidden) {
            window.focus(); 
        }

        const options: any = {
          body,
          icon: '/favicon.ico', // Caminho absoluto para garantir carregamento
          badge: '/favicon.ico',
          tag: 'capitalflow-critical', // Tag fixa para agrupar alertas críticos
          renotify: true, // Garante que vibre/toque novamente mesmo se houver outra notificação
          requireInteraction: true, // Mantém na tela até o usuário interagir
          silent: false,
          vibrate: [200, 100, 200, 100, 200] // Padrão de vibração urgente
        };

        try {
          const n = new Notification(title, options);

          n.onclick = (e) => {
              e.preventDefault();
              window.focus();
              if (onClick) {
                  onClick();
              }
              n.close();
          };
        } catch (err: any) {
          if (err.name === 'TypeError' || err.message?.includes('Illegal constructor')) {
            navigator.serviceWorker?.getRegistration().then(registration => {
              if (registration) {
                registration.showNotification(title, options);
              }
            });
          } else {
            throw err;
          }
        }
      } catch (e) {
        console.warn("Falha ao disparar notificação nativa:", e);
      }
    }
  }
};