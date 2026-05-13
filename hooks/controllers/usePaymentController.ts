// hooks/controllers/usePaymentController.ts
import React, { useRef } from 'react';
import { paymentsService } from '../../services/payments.service';
import { demoService } from '../../services/demo.service';
import { UserProfile, Loan, CapitalSource, UIController, PaymentType } from '../../types';

const isUUID = (v: any) =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

const safeUUID = (v: any) => (isUUID(v) ? v : null);

const parseMoney = (v: string) => {
  if (!v) return 0;
  const clean = String(v).replace(/[R$\s]/g, '');
  if (clean.includes('.') && clean.includes(',')) {
    return parseFloat(clean.replace(/\./g, '').replace(',', '.')) || 0;
  }
  if (clean.includes(',')) return parseFloat(clean.replace(',', '.')) || 0;
  return parseFloat(clean) || 0;
};

export const usePaymentController = (
  activeUser: UserProfile | null,
  ui: UIController,
  sources: CapitalSource[],
  loans: Loan[],
  setLoans: React.Dispatch<React.SetStateAction<Loan[]>>,
  setActiveUser: React.Dispatch<React.SetStateAction<UserProfile | null>>,
  fetchFullData: (id: string) => Promise<void>,
  showToast: (msg: string, type?: 'success' | 'error') => void
) => {
  const lockRef = useRef(false);

  const handlePayment = async (
    forgivenessMode?: 'NONE' | 'FINE_ONLY' | 'INTEREST_ONLY' | 'BOTH',
    manualDate?: Date | null,
    customAmount?: number,
    realDate?: Date | null,
    interestHandling?: 'CAPITALIZE' | 'KEEP_PENDING',
    paymentTypeOverride?: string,
    avAmountOverride?: string,
    contextOverride?: { loan: Loan, inst: any, calculations: any }
  ) => {
    const context = contextOverride || ui.paymentModal;
    if (!activeUser || !context) return;

    // 🔐 BLOQUEIO ABSOLUTO
    if (lockRef.current) return;
    lockRef.current = true;
    ui.setIsProcessingPayment(true);

    try {
      const ownerId = safeUUID(activeUser.supervisor_id) || safeUUID(activeUser.id);
      if (!ownerId) {
        showToast('Perfil inválido.', 'error');
        return;
      }

      // 🔒 Bloqueio extra — se parcela já paga
      if (context.inst?.status === 'PAID') {
        showToast('Esta parcela já foi quitada.', 'error');
        return;
      }

      const { amountToPay, paymentType } =
        await paymentsService.processPayment({
          loan: context.loan,
          inst: context.inst,
          calculations: context.calculations,
          amountPaid: customAmount || parseMoney(avAmountOverride || ui.avAmount),
          activeUser: activeUser,
          sources,
          forgivenessMode,
          manualDate,
          realDate,
          capitalizeRemaining: interestHandling === 'CAPITALIZE',
          paymentType: paymentTypeOverride,
          avAmount: avAmountOverride
        });

      showToast('Pagamento realizado com sucesso!', 'success');

      ui.closeModal();
      ui.setAvAmount('');

      // 🔥 FORÇA SINCRONIZAÇÃO REAL
      await fetchFullData(ownerId);

      ui.setShowReceipt({
        loan: context.loan,
        inst: context.inst,
        amountPaid: amountToPay,
        type: paymentType,
      });

      ui.openModal('RECEIPT');
    } catch (error: any) {
      console.error(error);
      showToast(error?.message || 'Erro ao processar pagamento.', 'error');
    } finally {
      ui.setIsProcessingPayment(false);
      lockRef.current = false;
    }
  };

  return { handlePayment };
};