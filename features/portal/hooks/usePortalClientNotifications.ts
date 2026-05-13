
import { useState, useEffect } from 'react';

interface PortalNotificationState {
    id: string;
    show: boolean;
    message: string;
    type: 'WARNING' | 'INFO' | 'SUCCESS';
    priority: number;
}

export const usePortalClientNotifications = (
    portalToken: string,
    portalCode: string,
    stats: { overdueCount: number; maxDaysLate: number; nextDueDate: Date | null }
) => {
    const [notifications, setNotifications] = useState<PortalNotificationState[]>([]);

    useEffect(() => {
        if (!portalToken || !portalCode) return;

        const STORAGE_KEY = `portal:lastOverdueState:${portalToken}:${portalCode}`;
        const lastStateStr = localStorage.getItem(STORAGE_KEY);
        const lastState = lastStateStr ? JSON.parse(lastStateStr) : { overdueCount: 0, maxDaysLate: 0 };

        const newNotifications: PortalNotificationState[] = [];

        // 1. Detecta novo atraso (antes 0, agora > 0)
        if (stats.overdueCount > 0 && lastState.overdueCount === 0) {
            newNotifications.push({
                id: 'new-overdue',
                show: true,
                message: "Atenção: Existem parcelas vencidas. Valores atualizados com multa.",
                type: 'WARNING',
                priority: 1
            });
        }
        // 2. Atraso agravou (mais parcelas ou mais dias)
        else if (stats.overdueCount > lastState.overdueCount || stats.maxDaysLate > lastState.maxDaysLate + 1) {
             newNotifications.push({
                id: 'aggravated-overdue',
                show: true,
                message: "Seu débito acumulou novos dias de atraso. Regularize para evitar bloqueio.",
                type: 'WARNING',
                priority: 1
            });
        }

        // 3. Próximo vencimento (hoje ou amanhã) - Adicionado para o efeito sanduíche
        if (stats.nextDueDate) {
            const diff = Math.ceil((stats.nextDueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            if (diff === 0) {
                newNotifications.push({
                    id: 'due-today',
                    show: true,
                    message: "Lembrete: Você tem uma parcela vencendo hoje.",
                    type: 'INFO',
                    priority: 2
                });
            }
        }

        // Se houver notificações, exibe
        if (newNotifications.length > 0) {
            setNotifications(newNotifications);
            
            // Salva estado atual para não repetir
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                overdueCount: stats.overdueCount,
                maxDaysLate: stats.maxDaysLate,
                ts: Date.now()
            }));

            // Auto-hide após 8s
            const timer = setTimeout(() => setNotifications([]), 8000);
            return () => clearTimeout(timer);
        }

    }, [portalToken, stats.overdueCount, stats.maxDaysLate, stats.nextDueDate]);

    return notifications;
};
