import { useEffect, useRef } from 'react';
import { Loan } from '../../../types';
import { getDaysDiff } from '../../../utils/dateHelpers';
import { notificationService } from '../../../services/notification.service';
import { supabase } from '../../../lib/supabase';
import { isPortalInstallmentPaid } from '../mappers/portalDebtRules';

export const usePortalPushNotifications = (contracts: Loan[], clientId: string | null) => {
  const notifiedEvents = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!clientId || contracts.length === 0) return;

    // 1. Monitorar Prazos (Executado ao carregar)
    contracts.forEach(loan => {
      loan.installments.forEach(inst => {
        if (isPortalInstallmentPaid(inst)) return;
        
        const diff = getDaysDiff(inst.dueDate);
        const eventId = `due-${inst.id}-${diff}`;

        if (notifiedEvents.current.has(eventId)) return;

        // Se vence hoje
        if (diff === 0) {
          notificationService.notify(
            "Vencimento Hoje",
            `Sua parcela de R$ ${inst.amount.toFixed(2)} vence hoje. Evite multas!`,
            () => window.focus()
          );
          notifiedEvents.current.add(eventId);
        }
      });
    });

    // 2. Monitorar Novas Mensagens do Operador (Realtime)
    const channel = supabase.channel(`portal-realtime-push-${clientId}`)
      .on('postgres_changes', { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'mensagens_suporte',
          filter: `sender_type=eq.OPERATOR`
      }, (payload) => {
          const msgLoanId = payload.new.loan_id;
          // Verifica se a mensagem pertence a um dos contratos ativos do cliente carregado
          const isMyLoan = contracts.some(c => c.id === msgLoanId);
          
          if (isMyLoan) {
              notificationService.notify(
                "Nova Mensagem do Gestor",
                "Você recebeu uma nova mensagem sobre seu contrato. Clique para visualizar.",
                () => window.focus()
              );
          }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [contracts, clientId]);
};
