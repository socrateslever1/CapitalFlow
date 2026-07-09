import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loan, LoanStatus, CapitalSource } from '../types';
import { loanEngine, isLegallyActionable } from '../domain/loanEngine';
import { getDaysDiff, isValidDate } from '../utils/dateHelpers';
import { notificationService } from '../services/notification.service';
import { notificationCenterService } from '../services/notificationCenter.service';
import { getInstallmentStatusLogic } from '../domain/finance/calculations';
import { playNotificationSound } from '../utils/notificationSound';
import { formatMoney } from '../utils/formatters';
import { formatBRDate } from '../utils/dateHelpers';

export interface InAppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  createdAt: number;
  isPersistent?: boolean;
  onClick?: () => void;
  action_url?: string;
  item_type?: string;
  item_id?: string;
  metadata?: any;
  dbId?: string;
}

interface NotificationProps {
  loans: Loan[];
  sources: CapitalSource[];
  activeUser: any;
  showToast: any;
  setActiveTab: (tab: any) => void;
  setSelectedLoanId: (id: string | null) => void;
  onDataChanged?: () => void;
  disabled?: boolean;
}

const MAX_VISIBLE_NOTIFICATIONS = 40;
const READ_SUPPRESSION_MS = 48 * 60 * 60 * 1000;
const typeByItem: Record<string, InAppNotification['type']> = {
  pagamento: 'success',
  documento: 'warning',
  carteira: 'error',
  suporte: 'info',
  lead: 'info',
  parcela: 'info',
  acordo: 'warning',
};

export const useAppNotifications = ({
  loans,
  sources,
  activeUser,
  showToast,
  setActiveTab,
  setSelectedLoanId,
  onDataChanged,
  disabled,
}: NotificationProps) => {
  const checkTimer = useRef<any>(null);
  const permissionAsked = useRef(false);
  const notifiedDueLoans = useRef<Set<string>>(new Set());
  const notifiedUnsignedLegal = useRef<Set<string>>(new Set());
  const lastUserId = useRef<string | null>(null);
  const notificationsRef = useRef<InAppNotification[]>([]);
  const queueRef = useRef<(Omit<InAppNotification, 'id' | 'createdAt'> & Partial<Pick<InAppNotification, 'id' | 'createdAt' | 'dbId'>>)[]>([]);
  const queueTimer = useRef<any>(null);
  const isQueueRunning = useRef(false);
  const [dismissedMap, setDismissedMap] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem('cm_dismissed_notifications') || '{}');
    } catch {
      return {};
    }
  });

  const isDismissed = (type?: string, id?: string) => {
    if (!type || !id) return false;
    const key = `${type}_${id}`;
    const dismissedAt = dismissedMap[key];
    if (!dismissedAt) return false;
    
    const now = Date.now();
    return (now - dismissedAt) < READ_SUPPRESSION_MS;
  };

  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);
  const notificationProfileId = activeUser ? activeUser.id : null;

  const mapDbNotification = useCallback((row: any): InAppNotification => ({
    id: row.id,
    dbId: row.id,
    title: row.titulo || 'CapitalFlow',
    message: row.mensagem || '',
    type: typeByItem[String(row.item_type || '')] || 'info',
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    action_url: row.action_url || undefined,
    item_type: row.item_type || undefined,
    item_id: row.item_id || undefined,
    metadata: row.metadata || undefined,
  }), []);

  const buildFingerprint = (notif: Pick<InAppNotification, 'title' | 'message' | 'item_type' | 'item_id'>) =>
    [notif.item_type || 'none', notif.item_id || 'none', notif.title, notif.message].join('::');

  const flushQueue = useCallback(() => {
    if (isQueueRunning.current) return;
    isQueueRunning.current = true;

    const step = () => {
      const next = queueRef.current.shift();
      if (!next) {
        isQueueRunning.current = false;
        return;
      }

      const fingerprint = buildFingerprint(next);
      const existsInState = notificationsRef.current.some(
        (n) => buildFingerprint(n) === fingerprint
      );

      if (!existsInState) {
        const createdAt = next.createdAt || Date.now();
        setNotifications((prev) => [
          {
            ...next,
            id: next.id || `${createdAt}-${Math.random().toString(36).slice(2, 9)}`,
            createdAt,
          },
          ...prev,
        ].slice(0, MAX_VISIBLE_NOTIFICATIONS));
        playNotificationSound();
      }

      queueTimer.current = setTimeout(step, 650);
    };

    step();
  }, []);

  const addNotification = useCallback((notif: Omit<InAppNotification, 'id' | 'createdAt'>) => {
    if (isDismissed(notif.item_type, notif.item_id)) return;
    const fingerprint = buildFingerprint(notif);

    const duplicateInState = notificationsRef.current.some((n) => {
      return buildFingerprint(n) === fingerprint && Date.now() - n.createdAt < READ_SUPPRESSION_MS;
    });
    if (duplicateInState) return;

    const duplicateInQueue = queueRef.current.some((n) => buildFingerprint(n) === fingerprint);
    if (duplicateInQueue) return;

    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    queueRef.current.push({ ...notif, id: clientId, createdAt: Date.now() });
    flushQueue();
    if (notificationProfileId && notificationProfileId !== 'DEMO') {
      void notificationCenterService.create({
        profileId: notificationProfileId,
        title: notif.title,
        message: notif.message,
        actionUrl: notif.action_url || null,
        itemType: notif.item_type || null,
        itemId: notif.item_id || null,
        metadata: notif.metadata || null,
      }).then((dbId) => {
        if (!dbId) return;
        setNotifications((prev) => prev.map((item) => (
          item.id === clientId ? { ...item, dbId } : item
        )));
      });
    }
  }, [notificationProfileId, dismissedMap, flushQueue]);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => {
      const target = prev.find(n => n.id === id);
      if (target?.item_type && target?.item_id) {
        const key = `${target.item_type}_${target.item_id}`;
        const newMap = { ...dismissedMap, [key]: Date.now() };
        setDismissedMap(newMap);
        localStorage.setItem('cm_dismissed_notifications', JSON.stringify(newMap));

        if (notificationProfileId && notificationProfileId !== 'DEMO') {
          void notificationCenterService.markItemAsRead(notificationProfileId, target.item_type, target.item_id);
        }
      }

      const targetDbId = target?.dbId || (id && id.length === 36 ? id : null);
      if (targetDbId) {
        void notificationCenterService.markAsRead(targetDbId);
      }

      return prev.filter(n => n.id !== id);
    });
  }, [dismissedMap, notificationProfileId]);

  const resetNotifiedCaches = () => {
    notifiedDueLoans.current = new Set();
    notifiedUnsignedLegal.current = new Set();
  };

  const loansRef = useRef<Loan[]>(loans);
  useEffect(() => {
    loansRef.current = loans;
  }, [loans]);

  useEffect(() => {
    if (!notificationProfileId || disabled || notificationProfileId === 'DEMO') return;

    let cancelled = false;
    notificationCenterService.listUnread(notificationProfileId).then((rows) => {
      if (cancelled) return;
      
      // Filter out notifications that were dismissed within 48h
      const mapped = rows.map(mapDbNotification).filter(item => {
        if (!item.item_type || !item.item_id) return true;
        const key = `${item.item_type}_${item.item_id}`;
        const dismissedAt = dismissedMap[key];
        if (!dismissedAt) return true;
        return (Date.now() - dismissedAt) >= READ_SUPPRESSION_MS;
      });

      setNotifications((prev) => {
        const next = [...mapped, ...prev];
        const seen = new Set<string>();
        return next.filter((item) => {
          const key = buildFingerprint(item);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).slice(0, MAX_VISIBLE_NOTIFICATIONS);
      });
    });

    const since = new Date(Date.now() - READ_SUPPRESSION_MS).toISOString();
    notificationCenterService.listRecentlyRead(notificationProfileId, since).then((rows) => {
      if (cancelled || !rows.length) return;
      setDismissedMap((prev) => {
        const next = { ...prev };
        rows.forEach((row: any) => {
          if (!row.item_type || !row.item_id || !row.read_at) return;
          next[`${row.item_type}_${row.item_id}`] = new Date(row.read_at).getTime();
        });
        localStorage.setItem('cm_dismissed_notifications', JSON.stringify(next));
        return next;
      });
    });

    const channel = supabase
      .channel(`notification-center-${notificationProfileId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notificacoes',
          filter: `profile_id=eq.${notificationProfileId}`,
        },
        (payload) => {
          const mapped = mapDbNotification(payload.new);
          if (isDismissed(mapped.item_type, mapped.item_id)) return;
          queueRef.current.push(mapped);
          flushQueue();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [notificationProfileId, disabled, flushQueue, mapDbNotification, dismissedMap]);

  // 1. Monitoramento em Tempo Real (Eventos Críticos de Negócio)
  useEffect(() => {
    if (!activeUser || !notificationProfileId || disabled) return;

    const channel = supabase
      .channel(`global-urgent-alerts-${notificationProfileId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'payment_intents',
          filter: `profile_id=eq.${notificationProfileId}`,
        },
        (payload) => {
          if (payload.new.status === 'PENDENTE') {
            if (isDismissed('pagamento', payload.new.id)) return;
            const onClick = () => {
                setActiveTab('CONTRACT_DETAILS');
                setSelectedLoanId(payload.new.loan_id);
            };
            const amount = Number(payload.new.amount || payload.new.valor || 0);
            const message = amount > 0
              ? `Cliente informou pagamento de ${formatMoney(amount)}. Revise o comprovante e dê baixa se estiver correto.`
              : 'Cliente informou um pagamento pelo portal. Revise o comprovante e confirme a baixa.';
            notificationService.notify(
              'Pagamento aguardando conferência',
              message,
              onClick
            );
            addNotification({
                title: 'Pagamento aguardando conferência',
                message,
                type: 'success',
                item_type: 'pagamento',
                item_id: payload.new.id,
                metadata: { loan_id: payload.new.loan_id }
            });
            showToast('Novo pagamento aguardando conferência.', 'success');
            onDataChanged?.();
          }
        }
      )
      // EVENTO REALTIME: Mudança em parcelas (vencimento/atraso)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'portal_files',
          filter: `profile_id=eq.${notificationProfileId}`,
        },
        (payload) => {
          if (payload.new.direction !== 'CLIENT_TO_OPERATOR') return;
          if (isDismissed('portal_file', payload.new.id)) return;
          const onClick = () => {
              setActiveTab('CONTRACT_DETAILS');
              setSelectedLoanId(payload.new.loan_id);
          };
          const message = payload.new.category === 'PAYMENT_PROOF'
            ? 'Cliente enviou um comprovante pelo portal. Revise antes de dar baixa.'
            : 'Cliente enviou um arquivo pelo portal. Revise no contrato.';
          notificationService.notify('Arquivo recebido pelo portal', message, onClick);
          addNotification({
              title: 'Arquivo recebido pelo portal',
              message,
              type: 'warning',
              item_type: 'portal_file',
              item_id: payload.new.id,
              metadata: { loan_id: payload.new.loan_id, portal_file_id: payload.new.id }
          });
          onDataChanged?.();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensagens_suporte',
          filter: `profile_id=eq.${notificationProfileId}`,
        },
        (payload) => {
          if (payload.new.sender_type !== 'CLIENT' && payload.new.sender !== 'CLIENT') return;
          if (isDismissed('suporte', payload.new.id)) return;
          const onClick = () => {
              setActiveTab('CONTRACT_DETAILS');
              setSelectedLoanId(payload.new.loan_id);
          };
          const message = 'Cliente enviou uma mensagem pelo portal. Abra o atendimento para responder.';
          notificationService.notify('Mensagem do cliente', message, onClick);
          addNotification({
              title: 'Mensagem do cliente',
              message,
              type: 'info',
              item_type: 'suporte',
              item_id: payload.new.id,
              metadata: { loan_id: payload.new.loan_id }
          });
          onDataChanged?.();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'parcelas',
          filter: `profile_id=eq.${notificationProfileId}`,
        },
        (payload) => {
          const loan = loansRef.current.find((l) => l.id === payload.new.loan_id);
          if (
            loan &&
            loanEngine.computeLoanStatus(loan) === 'OVERDUE' &&
            !loan.activeAgreement &&
            !isDismissed('documento', loan.id)
          ) {
            const onClick = () => {
                setActiveTab('LEGAL');
                setSelectedLoanId(loan.id);
            };
            const dueDate = payload.new.data_vencimento || payload.new.due_date || payload.new.dueDate;
            const dueText = dueDate ? ` Vencimento: ${formatBRDate(dueDate)}.` : '';
            const message = `${loan.debtorName} está em atraso e ainda não tem confissão de dívida assinada.${dueText}`;
            notificationService.notify(
              'Ação jurídica pendente',
              message,
              onClick
            );
            addNotification({
                title: 'Ação jurídica pendente',
                message,
                type: 'warning',
                item_type: 'documento',
                item_id: loan.id,
                metadata: { loan_id: loan.id }
            });
          }
        }
      )
      /* Desativado temporariamente: Notificações de Captação
      // EVENTO REALTIME: Novo Lead de Captação
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'leads',
          filter: `profile_id=eq.${activeUser.id}`,
        },
        (payload) => {
          const onClick = () => {
              setActiveTab('LEADS');
          };
          notificationService.notify(
            'Novo Lead de Captação!',
            `O cliente ${payload.new.nome} iniciou uma simulação.`,
            onClick
          );
          addNotification({
              title: 'Novo Lead de Captação!',
              message: `O cliente ${payload.new.nome} iniciou uma simulação.`,
              type: 'info',
              item_type: 'lead',
              item_id: payload.new.id
          });
          showToast(`Novo lead: ${payload.new.nome}`, 'success');
        }
      )
      // EVENTO REALTIME: Nova Mensagem no Chat de Captação
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'campaign_chat_messages',
          filter: `profile_id=eq.${activeUser.id}`,
        },
        (payload) => {
          if (payload.new.sender === 'LEAD') {
            const onClick = () => {
                setActiveTab('LEADS');
            };
            notificationService.notify(
              'Nova Mensagem de Lead',
              `Mensagem recebida no chat de captação.`,
              onClick
            );
            addNotification({
                title: 'Nova Mensagem de Lead',
                message: `Mensagem recebida no chat de captação.`,
                type: 'info',
                item_type: 'lead',
                item_id: payload.new.lead_id
            });
          }
        }
      )
      */
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeUser, notificationProfileId, disabled, setActiveTab, setSelectedLoanId, showToast, onDataChanged, addNotification]);

  // 2. Monitoramento Periódico (Vencimentos e Saldo)
  const runScan = async () => {
    if (disabled || !activeUser) return;

    if (!permissionAsked.current) {
      permissionAsked.current = true;
      notificationService.requestPermission();
    }

    // A) Contratos vencendo HOJE (Alerta Matinal)
    if (loans?.length) {
      loans.forEach((loan) => {
        if (!loan || (loan as any).isArchived) return;

        const installments = (loan as any).installments || [];
        installments.forEach((inst: any) => {
          if (!inst?.id || !inst?.dueDate || !isValidDate(inst.dueDate)) return;

          const status = getInstallmentStatusLogic(inst);
          if (status === LoanStatus.PAID) return;

          const diff = getDaysDiff(inst.dueDate);

          // Notifica apenas no dia exato e uma única vez por sessão
          if (diff === 0 && !notifiedDueLoans.current.has(inst.id)) {
            if (isDismissed('parcela', inst.id)) return;
            notifiedDueLoans.current.add(inst.id);
            const onClick = () => {
                setActiveTab('CONTRACT_DETAILS');
                setSelectedLoanId(loan.id);
            };
            const openAmount =
              Number(inst.principalRemaining || 0) +
              Number(inst.interestRemaining || 0) +
              Number(inst.lateFeeAccrued || 0);
            const amountText = openAmount > 0 ? ` Valor em aberto: ${formatMoney(openAmount)}.` : '';
            const message = `${loan.debtorName} tem parcela vencendo hoje (${formatBRDate(inst.dueDate)}).${amountText}`;
            notificationService.notify(
              'Parcela vence hoje',
              message,
              onClick
            );
            addNotification({
                title: 'Parcela vence hoje',
                message,
                type: 'info',
                item_type: 'parcela',
                item_id: inst.id,
                metadata: { loan_id: loan.id }
            });
          }
        });
      });
    }

    // B) Jurídico: Vencidos sem assinatura (Notificação de Cobrança)
    if (loans?.length) {
      loans.forEach((loan) => {
        // HARDENING: usa função isolada para evitar erro de HMR
        if (
          isLegallyActionable(loan) &&
          loanEngine.computeLoanStatus(loan) === 'OVERDUE' &&
          !(loan as any).activeAgreement &&
          !notifiedUnsignedLegal.current.has(loan.id) &&
          !isDismissed('documento', loan.id)
        ) {
          notifiedUnsignedLegal.current.add(loan.id);
          const onClick = () => {
              setActiveTab('LEGAL');
              setSelectedLoanId(loan.id);
          };
          const firstOverdue = (loan.installments || [])
            .filter((inst: any) => getDaysDiff(inst.dueDate) > 0)
            .sort((a: any, b: any) => getDaysDiff(b.dueDate) - getDaysDiff(a.dueDate))[0];
          const dueText = firstOverdue?.dueDate ? ` Vencimento: ${formatBRDate(firstOverdue.dueDate)}.` : '';
          const message = `${loan.debtorName} está vencido e ainda não tem confissão de dívida assinada.${dueText}`;
          notificationService.notify(
            'Ação jurídica pendente',
            message,
            onClick
          );
          addNotification({
              title: 'Ação jurídica pendente',
              message,
              type: 'warning',
              item_type: 'documento',
              item_id: loan.id,
              metadata: { loan_id: loan.id }
          });
        }
      });
    }

    // C) Saldo Crítico (Risco Operacional)
    (sources || []).forEach((source: any) => {
      if (!source?.id) return;
      const balance = Number(source.balance || 0);

      // Alerta apenas se cair abaixo de 50 reais (Extrema urgencia de caixa)
      if (balance < 50 && balance > -1000) {
        if (isDismissed('carteira', source.id)) return;
        addNotification({
          title: 'Carteira com saldo crítico',
          message: `${source.name || 'Carteira'} está com ${formatMoney(balance)} disponível. Evite novas saídas ou faça um aporte.`,
          type: 'error',
          isPersistent: true,
          item_type: 'carteira',
          item_id: source.id
        });
      }
    });
  };

  useEffect(() => {
    if (!activeUser || disabled) return;

    const currentId = String(activeUser?.id || '');
    if (lastUserId.current !== currentId) {
      lastUserId.current = currentId;
      resetNotifiedCaches();
      permissionAsked.current = false;
    }

    const delay = setTimeout(runScan, 5000);
    checkTimer.current = setInterval(runScan, 600000);

    return () => {
      clearTimeout(delay);
      if (checkTimer.current) clearInterval(checkTimer.current);
    };
  }, [activeUser, disabled, loans.length]);

  useEffect(() => {
    return () => {
      if (queueTimer.current) {
        clearTimeout(queueTimer.current);
      }
    };
  }, []);

  return { manualCheck: runScan, notifications, removeNotification, addNotification };
};
