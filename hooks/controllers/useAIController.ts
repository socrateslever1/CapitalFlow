import { Loan, Client } from '../../types';
import { calculateTotalDue } from '../../domain/finance/calculations';
import { generateUniqueAccessCode, generateUniqueClientNumber } from '../../utils/generators';
import { onlyDigits, normalizeBrazilianPhone, maskPhone } from '../../utils/formatters';

export const useAIController = (
  loans: Loan[],
  clients: Client[],
  ui: any,
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
) => {
  const handleAICommand = (result: any) => {
    const { intent, data } = result || {};

    if (!intent) return;

    if (intent === 'ANALYZE_PORTFOLIO') {
      return;
    }

    if (intent === 'REGISTER_CLIENT') {
      ui.setEditingClient(null);

      const codes = new Set(
        (clients || [])
          .map((c) => String((c as any).access_code || '').trim())
          .filter(Boolean)
      );
      const nums = new Set(
        (clients || [])
          .map((c) => String((c as any).client_number || '').trim())
          .filter(Boolean)
      );

      ui.setClientDraftAccessCode(generateUniqueAccessCode(codes));
      ui.setClientDraftNumber(generateUniqueClientNumber(nums));

      const rawPhone = String(data?.phone || '').trim();
      const rawName = String(data?.name || '').trim();

      ui.setClientForm({
        name: rawName,
        phone: rawPhone ? maskPhone(normalizeBrazilianPhone(rawPhone)) : '',
        document: '', // IA não deve inventar documento
        email: '',
        address: '',
        city: '',
        state: '',
        notes: 'Adicionado via Assistente IA',
        fotoUrl: ''
      });

      ui.openModal('CLIENT_FORM');
      return;
    }

    if (intent === 'REGISTER_PAYMENT') {
      const name = String(data?.name || '').trim();
      if (!name) {
        showToast('Não consegui identificar o nome do cliente na sua fala.', 'error');
        return;
      }

      const targetName = name.toLowerCase();

      // 1) tenta achar CLIENTE pelo nome (se existir lista carregada)
      const clientMatch = (clients || []).find((c: any) =>
        String(c?.name || '').toLowerCase().includes(targetName)
      );

      // 2) tenta achar CONTRATO
      const loan = (loans || []).find((l: any) => {
        if (l?.isArchived) return false;

        // Preferência: match por clientId (mais confiável)
        if (clientMatch?.id && l?.clientId && l.clientId === clientMatch.id) return true;

        // Fallback: match por debtorName
        return String(l?.debtorName || '').toLowerCase().includes(targetName);
      });

      if (!loan) {
        showToast(`Não encontrei nenhum contrato ativo para "${name}".`, 'error');
        return;
      }

      const inst = (loan.installments || []).find((i: any) => i?.status !== 'PAID');
      if (!inst) {
        showToast('Este contrato já consta como quitado.', 'info');
        return;
      }

      const calcs = calculateTotalDue(loan, inst);
      ui.setPaymentModal({ loan, inst, calculations: calcs });
      ui.openModal('PAYMENT');

      // Se veio valor na fala
      const amount = Number(data?.amount || 0);
      if (amount && !Number.isNaN(amount)) {
        // Se pagar só juros (tolerância)
        if (Math.abs(amount - calcs.interest) < 5) {
          ui.setPaymentType('RENEW_INTEREST');
          return;
        }

        if (amount >= calcs.total) {
          ui.setPaymentType('FULL');
          return;
        }

        // Renovação com AV (valor - juros)
        ui.setPaymentType('RENEW_AV');
        const av = Math.max(0, amount - calcs.interest);
        ui.setAvAmount(String(av));
      }

      return;
    }

    if (intent === 'ADD_REMINDER') {
      const newEvent = {
        id: Date.now(),
        title: data?.description || 'Lembrete IA',
        date: data?.date || new Date().toISOString().split('T')[0],
        desc: 'Agendado via voz'
      };

      const stored = localStorage.getItem('cm_agenda_events');
      const events = stored ? JSON.parse(stored) : [];
      events.push(newEvent);
      localStorage.setItem('cm_agenda_events', JSON.stringify(events));

      ui.openModal('AGENDA');
      showToast('Evento agendado com sucesso!', 'success');
      return;
    }
  };

  return { handleAICommand };
};