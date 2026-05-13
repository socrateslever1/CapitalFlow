// src/features/portal/components/PortalPaymentModal.tsx

import React, { useState, useMemo } from 'react';
import { X, Wallet, CheckCircle2 } from 'lucide-react';
import { Loan, Installment } from '../../../types';
import { portalService } from '../../../services/portal.service';
import { supabasePortal } from '../../../lib/supabasePortal';
import { resolvePaymentOptions, debugDebtCheck } from '../mappers/portalDebtRules';
import { BillingView, NotifyingView, SuccessView } from './payment/PaymentViews';
import { AsaasCheckoutModal } from './AsaasCheckoutModal';

interface PortalPaymentModalProps {
  portalToken: string;
  portalCode: string;
  loan: Loan;
  installment: Installment;
  clientData: { name: string; email?: string; doc?: string; id?: string };
  onClose: () => void;
}

const normalizeStatus = (v: any) => String(v ?? '').trim().toUpperCase();

const isLoanClosed = (loan: any) => {
  const s = normalizeStatus(loan?.status);
  return ['ENCERRADO', 'PAID', 'PAGO', 'QUITADO', 'CLOSED', 'FINALIZADO'].includes(s);
};

const isInstallmentPaid = (inst: any) => {
  const s = normalizeStatus(inst?.status);

  // 1) status (se vier certo)
  if (['PAID', 'PAGO', 'QUITADO'].includes(s)) return true;

  // 2) fallback real (fonte de verdade): remaining zerado
  const principalRem = Number(inst?.principalRemaining ?? inst?.principal_remaining ?? 0);
  const interestRem = Number(inst?.interestRemaining ?? inst?.interest_remaining ?? 0);

  // tolerância anti “-0.0000001”
  const eps = 0.000001;
  return principalRem <= eps && interestRem <= eps;
};

export const PortalPaymentModal: React.FC<PortalPaymentModalProps> = ({
  portalToken,
  portalCode,
  loan,
  installment,
  clientData,
  onClose,
}) => {
  const [step, setStep] = useState<'BILLING' | 'NOTIFYING' | 'SUCCESS'>('BILLING');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isProcessingOnline, setIsProcessingOnline] = useState(false);
  const [showAsaasModal, setShowAsaasModal] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const closedLoan = isLoanClosed(loan as any);
  const paidInst = isInstallmentPaid(installment as any);
  const shouldBlock = closedLoan || paidInst;

  // ✅ Fonte Única de Verdade (Rules) + 🔒 Bloqueio real
  const options = useMemo(() => {
    if (shouldBlock) {
      return {
        totalToPay: 0,
        renewToPay: 0,
        dueDateISO: (installment as any)?.dueDate || (installment as any)?.due_date || '',
        daysLate: 0,
      };
    }

    debugDebtCheck(loan, installment);
    return resolvePaymentOptions(loan, installment);
  }, [loan, installment, shouldBlock]);

  const pixKey = (loan as any).pixKey || (loan as any).pix_key || '';

  const handleNotifyPayment = async () => {
    // 🔒 BLOQUEIO ANTES DE CHAMAR O BACKEND
    if (shouldBlock) {
      setError('Este contrato/parcela já está quitado. Não é possível informar pagamento novamente.');
      setStep('BILLING');
      return;
    }

    setStep('NOTIFYING');
    setError(null);
    setIsProcessing(true);

    try {
      let comprovanteUrl = null;

      // 📤 UPLOAD DO COMPROVANTE (Se houver)
      if (receiptFile) {
        const fileExt = receiptFile.name.split('.').pop();
        const fileName = `${loan.id}_${Date.now()}.${fileExt}`;
        const filePath = `portal_receipts/${fileName}`;

        const { data: uploadData, error: uploadError } = await supabasePortal
          .storage
          .from('comprovantes')
          .upload(filePath, receiptFile);

        if (uploadError) {
          console.error('Erro no upload:', uploadError);
          // Prossegue mesmo sem o arquivo se for erro de bucket, ou para?
          // Melhor parar para garantir que o cliente saiba que não enviou.
          throw new Error('Falha ao enviar arquivo do comprovante. Tente novamente.');
        }

        if (uploadData) {
          const { data: { publicUrl } } = supabasePortal
            .storage
            .from('comprovantes')
            .getPublicUrl(filePath);
          comprovanteUrl = publicUrl;
        }
      }

      await portalService.submitPaymentIntentByPortalToken(
        portalToken,
        portalCode,
        'COMPROVANTE',
        comprovanteUrl ?? null
      );
      setStep('SUCCESS');
    } catch (e: any) {
      setError(e?.message || 'Erro ao notificar operador.');
      setStep('BILLING');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMercadoPago = async () => {
    if (shouldBlock) {
      setError('Este contrato/parcela já está quitado.');
      return;
    }

    setError(null);
    setIsProcessingOnline(true);

    try {
      // 1. Chama a Edge function e obtém o link seguro
      const initPoint = await portalService.createMercadoPagoPreference(
        portalToken,
        portalCode,
        loan.id,
        (installment as any).id,
        options.totalToPay
      );

      // 2. Redireciona o cliente para o Mercado Pago
      if (initPoint) {
        window.location.href = initPoint;
      } else {
         throw new Error('Link não retornado');
      }
    } catch (e: any) {
      setError(e?.message || 'Falha ao conectar com Mercado Pago.');
      setIsProcessingOnline(false);
    }
  };

  const copyPixKey = () => {
    if (pixKey) {
      navigator.clipboard.writeText(pixKey);
      alert('Chave PIX copiada!');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-[2rem] p-6 shadow-2xl relative animate-in zoom-in-95">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-black text-white uppercase text-center mb-6 flex items-center justify-center gap-2">
          {step === 'SUCCESS' ? (
            <CheckCircle2 className="text-emerald-500" />
          ) : (
            <Wallet className="text-emerald-500" />
          )}
          {step === 'SUCCESS' ? 'Operador Notificado!' : 'Realizar Pagamento'}
        </h2>

        {step === 'BILLING' && (
          <BillingView
            totalToPay={options.totalToPay}
            interestOnlyWithFees={options.renewToPay}
            dueDateISO={options.dueDateISO}
            daysLateRaw={options.daysLate}
            pixKey={pixKey}
            onCopyPix={copyPixKey}
            onNotify={handleNotifyPayment}
            error={error}
            isInstallmentPaid={shouldBlock}
            isProcessing={isProcessing}
            isProcessingOnline={isProcessingOnline}
            onMercadoPago={handleMercadoPago}
            receiptFile={receiptFile}
            onFileChange={setReceiptFile}
            onAsaas={() => setShowAsaasModal(true)}
          />
        )}

        {step === 'NOTIFYING' && <NotifyingView />}
        {step === 'SUCCESS' && <SuccessView onClose={onClose} />}

        {showAsaasModal && (
          <AsaasCheckoutModal
            loan={loan}
            installment={installment}
            clientData={clientData}
            portalToken={portalToken}
            portalCode={portalCode}
            onClose={() => setShowAsaasModal(false)}
            onSuccess={() => {
              setShowAsaasModal(false);
              setStep('SUCCESS');
            }}
          />
        )}
      </div>
    </div>
  );
};

export default PortalPaymentModal;