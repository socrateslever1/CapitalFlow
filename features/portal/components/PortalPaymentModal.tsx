// src/features/portal/components/PortalPaymentModal.tsx

import React, { useState, useMemo } from 'react';
import { X, Wallet, CheckCircle2, QrCode, Copy } from 'lucide-react';
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
  clientData: { name: string; email?: string; doc?: string; phone?: string; id?: string };
  onClose: () => void;
}

const normalizeStatus = (v: any) => String(v ?? '').trim().toUpperCase();

const isLoanClosed = (loan: any) => {
  const s = normalizeStatus(loan?.status);
  const open = (loan?.installments || []).reduce((sum: number, inst: any) => {
    return sum +
      Number(inst?.principalRemaining ?? inst?.principal_remaining ?? 0) +
      Number(inst?.interestRemaining ?? inst?.interest_remaining ?? 0) +
      Number(inst?.lateFeeAccrued ?? inst?.late_fee_accrued ?? 0);
  }, 0);
  return ['ENCERRADO', 'PAID', 'PAGO', 'QUITADO', 'CLOSED', 'FINALIZADO'].includes(s) && open <= 0.05;
};

const isInstallmentPaid = (inst: any) => {
  const principalRem = Number(inst?.principalRemaining ?? inst?.principal_remaining ?? 0);
  const interestRem = Number(inst?.interestRemaining ?? inst?.interest_remaining ?? 0);
  const lateFeeRem = Number(inst?.lateFeeAccrued ?? inst?.late_fee_accrued ?? 0);

  // tolerância anti -0.0000001
  const eps = 0.000001;
  return principalRem + interestRem + lateFeeRem <= eps;
};

export const PortalPaymentModal: React.FC<PortalPaymentModalProps> = ({
  portalToken,
  portalCode,
  loan,
  installment,
  clientData,
  onClose,
}) => {
  const [step, setStep] = useState<'BILLING' | 'PIX_AUTO' | 'NOTIFYING' | 'SUCCESS'>('BILLING');
  const [pixData, setPixData] = useState<{ qrCode: string; qrCodeBase64: string, providerPaymentId?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isProcessingOnline, setIsProcessingOnline] = useState(false);
  const [isProcessingInfinitePay, setIsProcessingInfinitePay] = useState(false);
  const [showAsaasModal, setShowAsaasModal] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'IDLE' | 'UPLOADING' | 'UPLOADED' | 'ERROR'>('IDLE');
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  // Efeito de polling para verificar se o pagamento via Mercado Pago foi confirmado
  React.useEffect(() => {
    let interval: any;
    if (step === 'PIX_AUTO' && pixData?.providerPaymentId) {
      interval = setInterval(async () => {
        const { data, error } = await supabasePortal
          .rpc('portal_get_payment_charge_status', {
            p_token: portalToken,
            p_shortcode: portalCode,
            p_provider_payment_id: pixData.providerPaymentId,
          });

        if (!error && data === 'PAID') {
          setStep('SUCCESS');
          clearInterval(interval);
        }
      }, 3000); // 3 segundos
    }
    return () => {
      if (interval) clearInterval(interval);
    }
  }, [step, pixData?.providerPaymentId, portalToken, portalCode]);

  const closedLoan = isLoanClosed(loan as any);
  const paidInst = isInstallmentPaid(installment as any);
  const shouldBlock = closedLoan || paidInst;

  // Fonte única de verdade (rules) com bloqueio real.
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
    // Bloqueio antes de chamar o backend.
    if (shouldBlock) {
      setError('Este contrato/parcela já está quitado. Não é possível informar pagamento novamente.');
      setStep('BILLING');
      return;
    }

    setStep('NOTIFYING');
    setError(null);
    setIsProcessing(true);
    setUploadStatus(receiptFile ? 'UPLOADING' : 'IDLE');
    setUploadMessage(receiptFile ? 'Enviando comprovante...' : null);

    try {
      let comprovanteUrl = null;

      // Upload do comprovante, se houver.
      if (receiptFile) {
        const formData = new FormData();
        formData.append('portal_token', portalToken);
        formData.append('portal_code', portalCode);
        formData.append('loan_id', loan.id);
        formData.append('file', receiptFile);

        const { data: uploadData, error: uploadError } = await supabasePortal.functions.invoke(
          'portal-receipt-upload',
          { body: formData }
        );

        if (uploadError) {
          console.error('Erro no upload:', uploadError);
          // Prossegue mesmo sem o arquivo se for erro de bucket, ou para?
          // Melhor parar para garantir que o cliente saiba que não enviou.
          throw new Error('Falha ao enviar arquivo do comprovante. Tente novamente.');
        }

        if (uploadData?.file_ref) {
          comprovanteUrl = uploadData.file_ref;
          setUploadStatus('UPLOADED');
          setUploadMessage('Comprovante carregado. Notificando operador...');
        }
      }

      const result = await portalService.submitPaymentIntentByPortalToken(
        portalToken,
        portalCode,
        'COMPROVANTE',
        comprovanteUrl ?? null
      );

      if (result && typeof result === 'object' && 'success' in result && result.success === false) {
        throw new Error(result.message || 'Nao foi possivel notificar o operador.');
      }

      setStep('SUCCESS');
    } catch (e: any) {
      if (receiptFile) {
        setUploadStatus('ERROR');
        setUploadMessage('Falha ao carregar o comprovante.');
      }
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
      // 1. Chama a Edge function para gerar o PIX dinâmico
      const data = await portalService.createMercadoPagoPix(
        portalToken,
        portalCode,
        loan.id,
        (installment as any).id,
        options.totalToPay,
        clientData
      );

      if (data && data.qrCode) {
        setPixData({ qrCode: data.qrCode, qrCodeBase64: data.qrCodeBase64, providerPaymentId: data.providerPaymentId });
        setStep('PIX_AUTO');
      } else {
         throw new Error('QR Code não retornado');
      }
    } catch (e: any) {
      setError(e?.message || 'Falha ao gerar o PIX automático.');
      setIsProcessingOnline(false);
    }
  };

  const handleMercadoPagoCard = async () => {
    if (shouldBlock) {
      setError('Este contrato/parcela já está quitado.');
      return;
    }

    setError(null);
    setIsProcessingOnline(true);

    try {
      const data = await portalService.createMercadoPagoPreference(
        portalToken,
        portalCode,
        loan.id,
        (installment as any).id,
        options.totalToPay
      );

      if (data && typeof data === 'string') {
        window.location.href = data;
      } else {
        throw new Error('URL de checkout não retornada');
      }
    } catch (e: any) {
      setError(e?.message || 'Falha ao iniciar pagamento online.');
      setIsProcessingOnline(false);
    }
  };

  const handleInfinitePay = async () => {
    if (shouldBlock) {
      setError('Este contrato/parcela jÃ¡ estÃ¡ quitado.');
      return;
    }

    setError(null);
    setIsProcessingInfinitePay(true);

    try {
      const data = await portalService.createInfinitePayCheckout(
        portalToken,
        portalCode,
        loan.id,
        (installment as any).id,
        options.totalToPay,
        clientData
      );

      if (data?.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error('URL de checkout nÃ£o retornada');
      }
    } catch (e: any) {
      setError(e?.message || 'Falha ao gerar checkout InfinitePay.');
      setIsProcessingInfinitePay(false);
    }
  };

  const copyPixKey = () => {
    if (pixKey) {
      navigator.clipboard.writeText(pixKey);
      alert('Chave PIX copiada!');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      {!showAsaasModal ? (
        <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-lg p-6 shadow-2xl relative animate-in zoom-in-95 my-auto">
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
              isProcessingInfinitePay={isProcessingInfinitePay}
              uploadStatus={uploadStatus}
              uploadMessage={uploadMessage}
              onMercadoPago={handleMercadoPago}
              onMercadoPagoCard={handleMercadoPagoCard}
              onInfinitePay={handleInfinitePay}
              receiptFile={receiptFile}
              onFileChange={(file) => {
                setReceiptFile(file);
                setUploadStatus('IDLE');
                setUploadMessage(null);
              }}
              onAsaas={() => setShowAsaasModal(true)}
            />
          )}

          {step === 'PIX_AUTO' && pixData && (
            <div className="py-2 flex flex-col items-center text-center space-y-4 animate-in zoom-in duration-300">
              <div className="p-3 bg-blue-500/10 text-blue-400 rounded-full">
                <QrCode size={36} />
              </div>

              <div>
                <h3 className="text-lg font-black text-white uppercase">PIX Gerado com Sucesso!</h3>
                <p className="text-slate-400 text-xs mt-1">
                  Escaneie o QR Code abaixo ou copie o código Copia e Cola para pagar.
                </p>
              </div>

              {/* QR Code Image */}
              {pixData.qrCodeBase64 ? (
                <div className="p-3 bg-white rounded-lg inline-block shadow-xl">
                  <img
                    src={`data:image/png;base64,${pixData.qrCodeBase64}`}
                    alt="QR Code Pix"
                    className="w-44 h-44"
                  />
                </div>
              ) : (
                <div className="w-44 h-44 bg-slate-800 rounded-lg flex items-center justify-center text-slate-500 border border-slate-700">
                  Sem imagem do QR Code
                </div>
              )}

              {/* Copia e Cola Text */}
              <div className="w-full space-y-2">
                <p className="text-[9px] text-slate-500 uppercase font-black tracking-widest pl-1 text-left">Código Copia e Cola</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-2.5 relative overflow-hidden text-left">
                    <p className="text-white text-[10px] font-mono truncate pr-6">
                      {pixData.qrCode}
                    </p>
                    <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-slate-950 to-transparent"></div>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(pixData.qrCode);
                      alert('Código Pix Copia e Cola copiado!');
                    }}
                    className="p-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg active:scale-95 transition-all shadow-md shrink-0"
                    title="Copiar Código"
                  >
                    <Copy size={16} />
                  </button>
                </div>
              </div>

              {/* Ações */}
              <div className="w-full pt-4 border-t border-slate-800 flex gap-2">
                <button
                  onClick={() => setStep('BILLING')}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[10px] uppercase rounded-lg transition-colors"
                >
                  Voltar
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] uppercase rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 size={12} /> Já paguei
                </button>
              </div>
            </div>
          )}

          {step === 'NOTIFYING' && <NotifyingView message={uploadMessage || undefined} />}
          {step === 'SUCCESS' && <SuccessView onClose={onClose} />}
        </div>
      ) : (
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
  );
};

export default PortalPaymentModal;

