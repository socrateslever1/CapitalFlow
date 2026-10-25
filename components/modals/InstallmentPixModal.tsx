import React, { useState, useMemo, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  QrCode, Copy, Check, MessageSquare, Printer,
  Edit2, AlertCircle, Sparkles, CheckCircle2, Loader2,
  RefreshCw, Zap, ShieldCheck, ArrowRight, ExternalLink
} from 'lucide-react';
import { Loan, Installment, UserProfile, CapitalSource } from '../../types';
import { Modal } from '../ui/Modal';
import { formatMoney } from '../../utils/formatters';
import { formatBRDate } from '../../utils/dateHelpers';
import { generatePixCopiaECola, buildPixWhatsAppMessage } from '../../utils/pixGenerator';
import { buildWhatsAppLink } from '../../utils/whatsapp';
import { createInfinitePayCheckout } from '../../services/infinitepay.service';
import { paymentConfigService } from '../../services/paymentConfig.service';
import { safeUUID } from '../../utils/uuid';
import { toast } from 'sonner';

export type PixPaymentMode = 'DIRECT' | 'INFINITEPAY';

export interface InstallmentPixModalProps {
  isOpen: boolean;
  onClose: () => void;
  loan: Loan;
  installment: Installment;
  debt?: any;
  activeUser?: UserProfile | null;
  sources?: CapitalSource[];
  onPaymentSuccess?: () => void;
}

export const InstallmentPixModal: React.FC<InstallmentPixModalProps> = ({
  isOpen,
  onClose,
  loan,
  installment,
  debt,
  activeUser,
  sources = [],
  onPaymentSuccess,
}) => {
  // Modo de operação: 'DIRECT' (Chave Direta/Sem taxa) ou 'INFINITEPAY' (InfinitePay Checkout)
  const [mode, setMode] = useState<PixPaymentMode>('DIRECT');

  // Resolução da fonte
  const source = sources.find((s) => s.id === loan.sourceId);

  // Valor padrão a ser cobrado
  const initialAmount = useMemo(() => {
    if (debt?.total && Number(debt.total) > 0) {
      return Number(debt.total);
    }
    const principalRem = Number(installment.principalRemaining || 0);
    const interestRem = Number(installment.interestRemaining || 0);
    const lateFee = Number(installment.lateFeeAccrued || 0);
    const totalRem = principalRem + interestRem + lateFee;
    if (totalRem > 0) return totalRem;

    return Number(installment.amount || 0);
  }, [debt, installment]);

  // Chave Pix padrão resolvida
  const defaultPixKey = useMemo(() => {
    return (
      loan.pixKey ||
      activeUser?.pixKey ||
      (source as any)?.pixKey ||
      (source as any)?.pix_key ||
      ''
    );
  }, [loan.pixKey, activeUser?.pixKey, source]);

  const [pixKey, setPixKey] = useState<string>(defaultPixKey);
  const [isEditingKey, setIsEditingKey] = useState<boolean>(!defaultPixKey);
  const [customAmount, setCustomAmount] = useState<string>(initialAmount.toFixed(2));
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedCheckoutUrl, setCopiedCheckoutUrl] = useState(false);

  // Estados do InfinitePay
  const [infinitePayHandle, setInfinitePayHandle] = useState<string>('');
  const [isEditingHandle, setIsEditingHandle] = useState<boolean>(false);
  const [infinitePayLoading, setInfinitePayLoading] = useState(false);
  const [infinitePayError, setInfinitePayError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  // Carrega a configuração da InfinitePay do perfil
  useEffect(() => {
    const profileId = safeUUID((loan as any).profile_id) || safeUUID(activeUser?.id);
    if (profileId) {
      paymentConfigService.getInfinitePayConfig(profileId).then((cfg) => {
        if (cfg?.infinitepay_handle) {
          setInfinitePayHandle(cfg.infinitepay_handle);
        }
      });
    }
  }, [loan, activeUser]);

  // Beneficiário padrão
  const merchantName = activeUser?.businessName || activeUser?.fullName || activeUser?.name || 'CAPITALFLOW';
  const merchantCity = activeUser?.city || 'BRASIL';

  const amountNumber = useMemo(() => {
    const parsed = Number(customAmount.replace(',', '.'));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : initialAmount;
  }, [customAmount, initialAmount]);

  // Gera o código Pix Copia e Cola (Modo Direto)
  const directPixPayload = useMemo(() => {
    if (!pixKey.trim()) return '';
    try {
      return generatePixCopiaECola({
        pixKey: pixKey.trim(),
        merchantName,
        merchantCity,
        amount: amountNumber,
        txid: `CF${installment.id ? installment.id.replace(/-/g, '').slice(0, 16) : 'PARC'}`,
        description: `PARC ${installment.number || 1}`,
      });
    } catch (err: any) {
      console.warn('[InstallmentPixModal] Erro ao gerar Pix payload:', err);
      return '';
    }
  }, [pixKey, merchantName, merchantCity, amountNumber, installment.id, installment.number]);

  // Vencimento formatado
  const dueDateStr = useMemo(() => {
    if (!installment?.dueDate) return '-';
    return formatBRDate(installment.dueDate);
  }, [installment?.dueDate]);

  // Informações de Atraso
  const isLate = useMemo(() => {
    if (!installment?.dueDate) return false;
    const dueTime = new Date(installment.dueDate).getTime();
    return dueTime < Date.now() && installment.status !== 'PAID';
  }, [installment]);

  // Função para gerar checkout na InfinitePay
  const handleGenerateInfinitePay = async () => {
    setInfinitePayLoading(true);
    setInfinitePayError(null);
    setCheckoutUrl(null);

    const profileId = safeUUID((loan as any).profile_id) || safeUUID(activeUser?.id);

    try {
      const response = await createInfinitePayCheckout({
        handle: infinitePayHandle.trim() || undefined,
        profile_id: profileId || undefined,
        amount: amountNumber,
        loan_id: loan.id,
        installment_id: installment.id,
        payer_name: loan.debtorName || 'Cliente',
        payer_email: (loan as any).debtorEmail || (loan as any).email || undefined,
        payer_doc: loan.debtorDocument || undefined,
        payer_phone: loan.debtorPhone || undefined,
      });

      if (!response.ok || !response.checkout_url) {
        throw new Error(response.error || 'Não foi possível gerar o link de checkout InfinitePay.');
      }

      setCheckoutUrl(response.checkout_url);
      toast.success('Link de checkout InfinitePay gerado com sucesso!');
    } catch (err: any) {
      console.warn('[InstallmentPixModal] Falha InfinitePay:', err);
      setInfinitePayError(err?.message || 'Erro ao gerar checkout InfinitePay.');
    } finally {
      setInfinitePayLoading(false);
    }
  };

  const handleSaveInfinitePayHandle = async () => {
    const clean = infinitePayHandle.trim().replace(/^[@$]+/, '');
    if (!clean) {
      toast.error('Informe uma InfiniteTag válida (ex: socrateslever).');
      return;
    }
    const profileId = safeUUID((loan as any).profile_id) || safeUUID(activeUser?.id);
    if (profileId) {
      try {
        await paymentConfigService.saveInfinitePayConfig(profileId, clean);
        toast.success(`InfiniteTag $${clean} salva com sucesso!`);
        setIsEditingHandle(false);
      } catch (e: any) {
        toast.error('Erro ao salvar tag: ' + e?.message);
      }
    } else {
      setIsEditingHandle(false);
    }
  };

  const handleCopyCode = async () => {
    if (!directPixPayload) {
      toast.error('Informe uma chave Pix válida primeiro.');
      return;
    }
    try {
      await navigator.clipboard.writeText(directPixPayload);
      setCopiedCode(true);
      toast.success('Código Pix Copia e Cola copiado!');
      setTimeout(() => setCopiedCode(false), 2500);
    } catch {
      toast.error('Não foi possível copiar automaticamente.');
    }
  };

  const handleCopyKey = async () => {
    if (!pixKey.trim()) return;
    try {
      await navigator.clipboard.writeText(pixKey.trim());
      setCopiedKey(true);
      toast.success('Chave Pix copiada!');
      setTimeout(() => setCopiedKey(false), 2500);
    } catch {
      toast.error('Erro ao copiar chave Pix.');
    }
  };

  const handleCopyCheckoutUrl = async () => {
    if (!checkoutUrl) return;
    try {
      await navigator.clipboard.writeText(checkoutUrl);
      setCopiedCheckoutUrl(true);
      toast.success('Link InfinitePay copiado!');
      setTimeout(() => setCopiedCheckoutUrl(false), 2500);
    } catch {
      toast.error('Erro ao copiar link.');
    }
  };

  const handleSendWhatsApp = () => {
    let message = '';

    if (mode === 'DIRECT') {
      if (!directPixPayload) {
        toast.error('Configure uma chave Pix antes de enviar a mensagem.');
        return;
      }
      message = buildPixWhatsAppMessage({
        debtorName: loan.debtorName,
        amount: amountNumber,
        dueDateStr,
        installmentNumber: installment.number,
        totalInstallments: loan.installments?.length,
        contractId: loan.id.slice(0, 8),
        pixCopiaECola: directPixPayload,
        pixKey: pixKey.trim(),
        beneficiaryName: merchantName,
      });
    } else {
      if (!checkoutUrl) {
        toast.error('Gere o link InfinitePay antes de enviar a mensagem.');
        return;
      }
      message = `Olá, *${loan.debtorName}*!

Segue o link seguro para pagamento da *Parcela #${installment.number || 1}* (Contrato *#${loan.id.slice(0, 8)}*):

💰 *Valor:* ${formatMoney(amountNumber)}
📅 *Vencimento:* ${dueDateStr}

👉 *Acesse para pagar via Pix ou Cartão:*
${checkoutUrl}

_CapitalFlow • Pagamento seguro via InfinitePay_`;
    }

    const phone = loan.debtorPhone || '';
    const link = buildWhatsAppLink(phone, message);
    window.open(link, '_blank');
  };

  const handlePrintVoucher = () => {
    const payloadToPrint = mode === 'DIRECT' ? directPixPayload : (checkoutUrl || '');
    if (!payloadToPrint) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Permita pop-ups no navegador para imprimir o comprovante Pix.');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Cobrança - ${loan.debtorName}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #0f172a; max-width: 480px; margin: 0 auto; }
          .header { text-align: center; border-bottom: 2px dashed #cbd5e1; padding-bottom: 16px; margin-bottom: 16px; }
          .title { font-size: 18px; font-weight: 800; text-transform: uppercase; margin: 0; }
          .subtitle { font-size: 12px; color: #64748b; margin-top: 4px; }
          .qr-box { display: flex; justify-content: center; margin: 20px 0; }
          .details { background: #f8fafc; border-radius: 8px; padding: 14px; font-size: 13px; line-height: 1.6; }
          .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
          .label { color: #64748b; font-weight: 500; }
          .val { font-weight: 700; }
          .code-box { margin-top: 16px; padding: 10px; background: #e2e8f0; border-radius: 6px; font-family: monospace; font-size: 10px; word-break: break-all; }
          .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 20px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">Cobrança de Parcela</h1>
          <div class="subtitle">CapitalFlow • ${mode === 'DIRECT' ? 'Pix Direto' : 'InfinitePay'}</div>
        </div>
        <div class="details">
          <div class="row"><span class="label">Cliente:</span><span class="val">${loan.debtorName}</span></div>
          <div class="row"><span class="label">CPF/CNPJ:</span><span class="val">${loan.debtorDocument || '-'}</span></div>
          <div class="row"><span class="label">Parcela:</span><span class="val">#${installment.number || 1} de ${loan.installments?.length || 1}</span></div>
          <div class="row"><span class="label">Vencimento:</span><span class="val">${dueDateStr}</span></div>
          <div class="row"><span class="label">Beneficiário:</span><span class="val">${merchantName}</span></div>
          <div class="row" style="margin-top: 8px; font-size: 15px; border-top: 1px solid #e2e8f0; padding-top: 6px;">
            <span class="label" style="color: #0f172a; font-weight: 800;">VALOR A PAGAR:</span>
            <span class="val" style="color: #059669; font-weight: 800;">${formatMoney(amountNumber)}</span>
          </div>
        </div>
        <div class="qr-box">
          <div id="qrcode"></div>
        </div>
        <div class="code-box">
          <strong>${mode === 'DIRECT' ? 'Pix Copia e Cola:' : 'Link de Pagamento InfinitePay:'}</strong><br/>
          ${payloadToPrint}
        </div>
        <div class="footer">
          ${mode === 'DIRECT' ? 'Abra o app do seu banco e pague com Pix Copia e Cola ou QR Code.' : 'Acesse o link para pagar com Pix ou Cartão de Crédito pela InfinitePay.'}
        </div>
        <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
        <script>
          new QRCode(document.getElementById("qrcode"), {
            text: "${payloadToPrint}",
            width: 180,
            height: 180,
            correctLevel: QRCode.CorrectLevel.M
          });
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  if (!isOpen) return null;

  return (
    <Modal
      onClose={onClose}
      title="Cobrança da Parcela"
      subtitle={`${loan.debtorName} • Parcela #${installment.number || 1}`}
      icon={<QrCode className="text-cyan-400" size={20} />}
      compact
    >
      <div className="space-y-4">
        {/* Abas de Escolha: Pix Direto vs InfinitePay */}
        <div className="flex items-center rounded-xl bg-slate-900 p-1 border border-slate-800">
          <button
            type="button"
            onClick={() => setMode('DIRECT')}
            className={`flex-1 py-2 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              mode === 'DIRECT'
                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-950/50'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Zap size={13} className={mode === 'DIRECT' ? 'text-cyan-200' : 'text-slate-500'} />
            <span>Pix Direto (Sem Taxa)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('INFINITEPAY');
              if (!checkoutUrl && !infinitePayLoading) {
                void handleGenerateInfinitePay();
              }
            }}
            className={`flex-1 py-2 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              mode === 'INFINITEPAY'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles size={13} className={mode === 'INFINITEPAY' ? 'text-emerald-200' : 'text-slate-500'} />
            <span>InfinitePay (Checkout / Pix)</span>
          </button>
        </div>

        {/* Banner do Valor e Vencimento */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between shadow-xl">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">
              Valor da Cobrança
            </span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-black text-emerald-400">
                {formatMoney(amountNumber)}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-slate-400 font-bold">
                Vencimento: <strong className="text-white">{dueDateStr}</strong>
              </span>
              {isLate && (
                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  Atrasada
                </span>
              )}
            </div>
          </div>

          <div className="text-right">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 block">
              Modalidade
            </span>
            <span className="text-xs font-bold text-slate-300">
              {mode === 'DIRECT' ? 'Chave Direta' : 'InfinitePay'}
            </span>
          </div>
        </div>

        {/* MODO 1: PIX DIRETO (CHAVE BACEN / SEM TAXA) */}
        {mode === 'DIRECT' && (
          <>
            {/* Gerenciamento da Chave Pix */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <span>Chave Pix de Destino</span>
                  {!pixKey && (
                    <span className="text-rose-400 flex items-center gap-1">
                      <AlertCircle size={12} /> Não cadastrada
                    </span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => setIsEditingKey(!isEditingKey)}
                  className="text-[9px] font-bold text-cyan-400 hover:text-cyan-300 uppercase flex items-center gap-1 cursor-pointer"
                >
                  <Edit2 size={11} /> {isEditingKey ? 'Concluir' : 'Alterar'}
                </button>
              </div>

              {isEditingKey ? (
                <div className="space-y-1">
                  <input
                    type="text"
                    value={pixKey}
                    onChange={(e) => setPixKey(e.target.value)}
                    placeholder="CPF, CNPJ, E-mail, Telefone ou Chave Aleatória"
                    className="w-full bg-slate-900 border border-cyan-500/40 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-cyan-400 transition-all font-mono"
                    autoFocus
                  />
                  <p className="text-[9px] text-slate-500">
                    O dinheiro cai 100% direto na sua conta bancária sem intermediários ou taxas.
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-slate-900 px-3 py-2 rounded-lg border border-slate-800">
                  <span className="font-mono text-xs text-slate-200 truncate pr-2">
                    {pixKey || 'Nenhuma chave informada'}
                  </span>
                  {pixKey && (
                    <button
                      type="button"
                      onClick={handleCopyKey}
                      className="p-1 hover:bg-slate-800 text-slate-400 hover:text-cyan-400 rounded transition-colors cursor-pointer"
                      title="Copiar Chave Pix"
                    >
                      {copiedKey ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* QR Code Container (Modo Direto) */}
            {directPixPayload ? (
              <div className="flex flex-col items-center justify-center p-4 bg-slate-950/80 border border-slate-800 rounded-2xl relative group">
                <div className="p-3.5 bg-white rounded-2xl shadow-2xl shadow-cyan-950/40 border border-slate-200">
                  <QRCodeSVG
                    value={directPixPayload}
                    size={190}
                    level="M"
                    includeMargin={false}
                  />
                </div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-3">
                  Escaneie com o app de qualquer banco
                </span>
              </div>
            ) : (
              <div className="p-6 bg-slate-950/40 border border-slate-800/80 rounded-2xl text-center space-y-2">
                <AlertCircle className="mx-auto text-amber-400" size={28} />
                <p className="text-xs text-slate-300 font-bold">Chave Pix Necessária</p>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                  Digite uma chave Pix válida no campo acima para gerar o QR Code desta parcela.
                </p>
              </div>
            )}
          </>
        )}

        {/* MODO 2: INFINITEPAY */}
        {mode === 'INFINITEPAY' && (
          <div className="space-y-3">
            {/* Tag InfinitePay */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <span>Sua InfiniteTag ($tag)</span>
                  {!infinitePayHandle && (
                    <span className="text-amber-400 flex items-center gap-1">
                      <AlertCircle size={12} /> Não configurada
                    </span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => setIsEditingHandle(!isEditingHandle)}
                  className="text-[9px] font-bold text-emerald-400 hover:text-emerald-300 uppercase flex items-center gap-1 cursor-pointer"
                >
                  <Edit2 size={11} /> {isEditingHandle ? 'Cancelar' : 'Alterar'}
                </button>
              </div>

              {isEditingHandle ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-bold font-mono">$</span>
                      <input
                        type="text"
                        value={infinitePayHandle}
                        onChange={(e) => setInfinitePayHandle(e.target.value)}
                        placeholder="socrateslever"
                        className="w-full bg-slate-900 border border-emerald-500/40 rounded-lg pl-7 pr-3 py-2 text-xs text-white outline-none focus:border-emerald-400 transition-all font-mono"
                        autoFocus
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveInfinitePayHandle}
                      className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-black uppercase cursor-pointer"
                    >
                      Salvar
                    </button>
                  </div>
                  <p className="text-[9px] text-slate-500">
                    Sua tag de recebimento na InfinitePay (sem o símbolo $).
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-slate-900 px-3 py-2 rounded-lg border border-slate-800">
                  <span className="font-mono text-xs text-emerald-400 font-bold truncate pr-2">
                    {infinitePayHandle ? `$${infinitePayHandle.replace(/^[@$]+/, '')}` : 'Nenhuma InfiniteTag informada'}
                  </span>
                  <button
                    type="button"
                    onClick={handleGenerateInfinitePay}
                    disabled={infinitePayLoading}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold uppercase rounded flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw size={11} className={infinitePayLoading ? 'animate-spin' : ''} />
                    <span>Atualizar</span>
                  </button>
                </div>
              )}
            </div>

            {infinitePayLoading && (
              <div className="p-8 bg-slate-950/70 border border-slate-800 rounded-2xl text-center space-y-3">
                <Loader2 className="mx-auto text-emerald-500 animate-spin" size={32} />
                <p className="text-xs text-white font-bold uppercase tracking-wide">
                  Gerando Checkout InfinitePay...
                </p>
                <p className="text-[10px] text-slate-500">
                  Criando link com Pix e Cartão de Crédito
                </p>
              </div>
            )}

            {infinitePayError && (
              <div className="p-4 bg-rose-950/30 border border-rose-900/60 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-rose-400 font-bold text-xs">
                  <AlertCircle size={16} />
                  <span>Erro no Checkout InfinitePay</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {infinitePayError}
                </p>
                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleGenerateInfinitePay}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw size={12} /> Tentar Novamente
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('DIRECT')}
                    className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    <Zap size={12} /> Usar Pix Direto (Sem Taxa)
                  </button>
                </div>
              </div>
            )}

            {!infinitePayLoading && checkoutUrl && (
              <div className="flex flex-col items-center justify-center p-4 bg-slate-950/80 border border-slate-800 rounded-2xl relative group space-y-3">
                <div className="p-3.5 bg-white rounded-2xl shadow-2xl shadow-emerald-950/40 border border-slate-200">
                  <QRCodeSVG
                    value={checkoutUrl}
                    size={170}
                    level="M"
                    includeMargin={false}
                  />
                </div>

                <div className="w-full flex items-center justify-between bg-slate-900 px-3 py-2 rounded-lg border border-slate-800">
                  <span className="font-mono text-[10px] text-slate-300 truncate pr-2">
                    {checkoutUrl}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyCheckoutUrl}
                    className="p-1 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 rounded transition-colors cursor-pointer shrink-0"
                    title="Copiar Link"
                  >
                    {copiedCheckoutUrl ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>

                <a
                  href={checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-emerald-500/40 text-emerald-400 font-bold text-xs uppercase flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <ExternalLink size={14} />
                  <span>Abrir Checkout InfinitePay</span>
                </a>
              </div>
            )}
          </div>
        )}

        {/* Botões de Ação */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          {mode === 'DIRECT' ? (
            <button
              type="button"
              onClick={handleCopyCode}
              disabled={!directPixPayload}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-black text-[11px] uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-cyan-950/40 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {copiedCode ? (
                <>
                  <Check size={16} className="text-white" />
                  <span>Código Copiado!</span>
                </>
              ) : (
                <>
                  <Copy size={16} />
                  <span>Copiar Pix Copia e Cola</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCopyCheckoutUrl}
              disabled={!checkoutUrl}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-[11px] uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-950/40 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {copiedCheckoutUrl ? (
                <>
                  <Check size={16} className="text-white" />
                  <span>Link Copiado!</span>
                </>
              ) : (
                <>
                  <Copy size={16} />
                  <span>Copiar Link InfinitePay</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={handleSendWhatsApp}
            disabled={mode === 'DIRECT' ? !directPixPayload : !checkoutUrl}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-black text-[11px] uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-950/40 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <MessageSquare size={16} />
            <span>Enviar no WhatsApp</span>
          </button>
        </div>

        {/* Ação secundária: Imprimir */}
        <div className="flex items-center justify-center pt-1">
          <button
            type="button"
            onClick={handlePrintVoucher}
            disabled={mode === 'DIRECT' ? !directPixPayload : !checkoutUrl}
            className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 py-1 px-3 rounded-lg hover:bg-slate-900 cursor-pointer disabled:opacity-40"
          >
            <Printer size={13} /> Imprimir Comprovante / Ficha de Cobrança
          </button>
        </div>
      </div>
    </Modal>
  );
};
