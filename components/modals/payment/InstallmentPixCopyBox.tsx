import React, { useState, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Copy, 
  Check, 
  QrCode, 
  Share2, 
  Sparkles, 
  Edit2, 
  ChevronDown, 
  ChevronUp, 
  AlertCircle, 
  KeyRound,
  ExternalLink
} from 'lucide-react';
import { Loan, Installment, UserProfile, CapitalSource } from '../../../types';
import { formatMoney } from '../../../utils/formatters';
import { formatBRDate } from '../../../utils/dateHelpers';
import { generatePixCopiaECola, buildPixWhatsAppMessage, normalizePixKey } from '../../../utils/pixGenerator';
import { buildWhatsAppLink } from '../../../utils/whatsapp';
import { copyToClipboard } from '../../../utils/clipboard';
import { toast } from 'sonner';

export interface InstallmentPixCopyBoxProps {
  loan: Loan;
  installment: Installment;
  amount: number;
  activeUser?: UserProfile | null;
  source?: CapitalSource | null;
  isPaymentMethodPix: boolean;
  onSelectPixMethod?: () => void;
}

export const InstallmentPixCopyBox: React.FC<InstallmentPixCopyBoxProps> = ({
  loan,
  installment,
  amount,
  activeUser,
  source,
  isPaymentMethodPix,
  onSelectPixMethod,
}) => {
  // Resolução da chave padrão
  const defaultPixKey = useMemo(() => {
    return (
      loan.pixKey ||
      activeUser?.pixKey ||
      (source as any)?.pixKey ||
      (source as any)?.pix_key ||
      ''
    );
  }, [loan.pixKey, activeUser?.pixKey, source]);

  const [customKey, setCustomKey] = useState<string>('');
  const [isEditingKey, setIsEditingKey] = useState<boolean>(false);
  const [keyInput, setKeyInput] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [showQR, setShowQR] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(isPaymentMethodPix);

  // Mantém expandido se método de pagamento mudar para PIX
  React.useEffect(() => {
    if (isPaymentMethodPix) {
      setIsExpanded(true);
    }
  }, [isPaymentMethodPix]);

  const effectiveKey = (customKey.trim() || defaultPixKey).trim();

  // Dados do beneficiário e da transação
  const merchantName = activeUser?.businessName || activeUser?.fullName || activeUser?.name || 'CAPITALFLOW';
  const merchantCity = (activeUser as any)?.city || 'BRASIL';
  const installmentNum = (installment as any).installmentNumber || installment.number || 1;
  const debtorPhone = loan.debtorPhone || (loan as any).phone || '';
  const txid = `PARC${installmentNum}`.replace(/[^a-zA-Z0-9]/g, '').slice(0, 25);
  const description = `PARC ${installmentNum} ${loan.debtorName || ''}`.trim();

  // Valor a cobrar no Pix
  const pixAmount = amount > 0 ? amount : Number(installment.amount || 0);

  // Geração do código Pix Copia e Cola padrão EMV BRCode
  const { pixString, error } = useMemo(() => {
    if (!effectiveKey) {
      return { pixString: '', error: 'Nenhuma chave Pix configurada para este recebimento.' };
    }
    try {
      const code = generatePixCopiaECola({
        pixKey: effectiveKey,
        merchantName,
        merchantCity,
        amount: pixAmount > 0 ? pixAmount : undefined,
        txid,
        description,
      });
      return { pixString: code, error: null };
    } catch (err: any) {
      return { pixString: '', error: err?.message || 'Erro ao gerar Pix Copia e Cola.' };
    }
  }, [effectiveKey, merchantName, merchantCity, pixAmount, txid, description]);

  const handleCopy = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!pixString) {
      toast.error('Nenhum código Pix disponível para cópia.');
      return;
    }

    const success = await copyToClipboard(pixString);
    if (success) {
      setCopied(true);
      toast.success('Código Pix Copia e Cola copiado com sucesso!');
      setTimeout(() => setCopied(false), 2500);
      if (!isPaymentMethodPix && onSelectPixMethod) {
        onSelectPixMethod();
      }
    } else {
      toast.error('Falha ao copiar código Pix.');
    }
  };

  const handleSaveCustomKey = () => {
    const trimmed = keyInput.trim();
    if (!trimmed) {
      toast.error('Informe uma chave Pix válida.');
      return;
    }
    setCustomKey(trimmed);
    setIsEditingKey(false);
    toast.success('Chave Pix atualizada para este recebimento.');
  };

  const handleShareWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!pixString) return;

    const formattedDate = installment.dueDate ? formatBRDate(installment.dueDate) : 'No vencimento';
    const message = buildPixWhatsAppMessage({
      debtorName: loan.debtorName,
      amount: pixAmount,
      dueDateStr: formattedDate,
      installmentNumber: installmentNum,
      contractId: String(loan.id),
      pixCopiaECola: pixString,
      pixKey: effectiveKey,
      beneficiaryName: merchantName,
    });

    const link = buildWhatsAppLink(debtorPhone, message);
    window.open(link, '_blank');
  };

  return (
    <div className={`rounded-xl border transition-all duration-300 overflow-hidden ${
      isPaymentMethodPix 
        ? 'border-emerald-500/50 bg-gradient-to-b from-slate-900 to-slate-950 shadow-lg shadow-emerald-950/20' 
        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
    }`}>
      {/* Header clicável para expandir/recolher */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-4 flex items-center justify-between cursor-pointer select-none transition-colors hover:bg-slate-800/40"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
            isPaymentMethodPix 
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' 
              : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
          }`}>
            <QrCode size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black uppercase tracking-wider text-white">
                Pix Copia e Cola
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Parc. #{installmentNum}
              </span>
              {isPaymentMethodPix && (
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950">
                  Método Ativo
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 truncate mt-0.5">
              Valor para pagamento: <strong className="text-emerald-400">{formatMoney(pixAmount)}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {pixString && !isExpanded && (
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span>{copied ? 'Copiado!' : 'Copiar'}</span>
            </button>
          )}
          <span className="text-slate-500">
            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </span>
        </div>
      </div>

      {/* Conteúdo expandido */}
      {isExpanded && (
        <div className="p-4 pt-1 border-t border-slate-800/80 space-y-4">
          {/* Gerenciamento da chave Pix */}
          <div className="bg-slate-950/80 rounded-lg p-3 border border-slate-800 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-slate-400">
                <KeyRound size={14} className="text-emerald-400 shrink-0" />
                <span className="font-semibold text-slate-300">Chave Pix recebedora:</span>
                {effectiveKey ? (
                  <code className="text-emerald-300 bg-emerald-950/50 px-2 py-0.5 rounded font-mono font-bold text-[11px]">
                    {effectiveKey}
                  </code>
                ) : (
                  <span className="text-rose-400 font-bold">Não definida</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setKeyInput(effectiveKey);
                  setIsEditingKey(!isEditingKey);
                }}
                className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 underline"
              >
                <Edit2 size={12} /> {isEditingKey ? 'Cancelar' : 'Alterar'}
              </button>
            </div>

            {isEditingKey && (
              <div className="mt-2.5 pt-2.5 border-t border-slate-800/60 flex items-center gap-2">
                <input
                  type="text"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="CPF, CNPJ, celular, e-mail ou chave EVP..."
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-emerald-500 font-mono"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSaveCustomKey}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                >
                  Salvar
                </button>
              </div>
            )}
          </div>

          {/* Erro se não houver chave */}
          {error ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-start gap-3">
              <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-bold text-amber-300">Chave Pix Necessária</p>
                <p className="text-slate-300 mt-1">
                  Configure uma chave Pix no perfil ou digite a chave acima para gerar o código Copia e Cola instantâneo desta parcela.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* String Pix Copia e Cola */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles size={12} className="text-emerald-400" />
                    Código Pix Copia e Cola (EMV BRCode)
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Padrão Banco Central do Brasil
                  </span>
                </div>

                <div 
                  onClick={handleCopy}
                  title="Clique para copiar"
                  className="group relative bg-slate-950 border border-slate-800 hover:border-emerald-500/60 rounded-lg p-3 cursor-pointer transition-all"
                >
                  <p className="font-mono text-[11px] text-slate-300 break-all leading-relaxed line-clamp-3 select-all">
                    {pixString}
                  </p>
                  <div className="absolute inset-0 bg-emerald-950/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-end pr-3 pointer-events-none">
                    <span className="text-[10px] font-bold text-emerald-400 bg-slate-950/90 px-2 py-1 rounded border border-emerald-500/30 flex items-center gap-1 shadow">
                      <Copy size={11} /> Clique para copiar
                    </span>
                  </div>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`w-full py-2.5 px-3 rounded-lg font-black uppercase text-[11px] tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md ${
                    copied
                      ? 'bg-emerald-500 text-slate-950 ring-2 ring-emerald-400'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check size={15} />
                      <span>Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={15} />
                      <span>Copiar Pix</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowQR(!showQR)}
                  className="w-full py-2.5 px-3 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold uppercase text-[11px] tracking-wider transition-all flex items-center justify-center gap-1.5"
                >
                  <QrCode size={15} />
                  <span>{showQR ? 'Ocultar QR' : 'Ver QR Code'}</span>
                </button>

                {debtorPhone ? (
                  <button
                    type="button"
                    onClick={handleShareWhatsApp}
                    className="w-full py-2.5 px-3 rounded-lg border border-emerald-900/60 bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 font-bold uppercase text-[11px] tracking-wider transition-all flex items-center justify-center gap-1.5"
                  >
                    <Share2 size={15} />
                    <span>WhatsApp</span>
                  </button>
                ) : (
                  !isPaymentMethodPix && onSelectPixMethod && (
                    <button
                      type="button"
                      onClick={onSelectPixMethod}
                      className="w-full py-2.5 px-3 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-300 font-bold uppercase text-[11px] tracking-wider transition-all flex items-center justify-center gap-1.5"
                    >
                      <span>Definir PIX</span>
                    </button>
                  )
                )}
              </div>

              {/* QR Code Inline se ativado */}
              {showQR && pixString && (
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-center animate-in fade-in zoom-in-95 duration-200">
                  <div className="inline-block p-3 bg-white rounded-xl shadow-xl">
                    <QRCodeSVG
                      value={pixString}
                      size={180}
                      level="M"
                      includeMargin={false}
                    />
                  </div>
                  <p className="text-[11px] font-bold text-slate-300 mt-3">
                    Aponte a câmera do aplicativo bancário
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Beneficiário: {merchantName} · {formatMoney(pixAmount)}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
