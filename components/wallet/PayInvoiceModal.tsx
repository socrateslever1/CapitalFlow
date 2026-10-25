import React, { useState } from 'react';
import { X, Receipt, CheckCircle2, AlertCircle, Landmark, CreditCard, Loader2 } from 'lucide-react';
import { PersonalWalletCard, PersonalWalletAccount } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';

export interface PayInvoiceModalProps {
  card: PersonalWalletCard;
  accounts: PersonalWalletAccount[];
  invoiceAmount?: number;
  dueMonth?: string;
  onClose: () => void;
  onPay: (cardId: string, dueMonth: string, accountId: string) => Promise<void>;
}

export const PayInvoiceModal: React.FC<PayInvoiceModalProps> = ({
  card,
  accounts,
  invoiceAmount = 0,
  dueMonth,
  onClose,
  onPay,
}) => {
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0]?.id || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const amountToPay = invoiceAmount > 0 
    ? invoiceAmount 
    : (Number(card.current_bill || 0) > 0 ? Number(card.current_bill) : Number(card.used_limit || 0));

  const resolvedDueMonth = dueMonth || `${new Date().toISOString().slice(0, 7)}-01`;
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId) {
      setError('Selecione uma conta bancária para debitar o pagamento.');
      return;
    }
    if (selectedAccount && selectedAccount.balance < amountToPay) {
      // Aviso, mas permite continuar caso o banco tenha limite de cheque especial
    }
    setLoading(true);
    setError('');
    try {
      await onPay(card.id, resolvedDueMonth, selectedAccountId);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Falha ao processar o pagamento da fatura.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-modal-open="true"
      className="fixed inset-0 z-[2000] flex flex-col justify-end sm:justify-center sm:items-center bg-slate-950/85 sm:p-4 backdrop-blur-sm animate-in fade-in overflow-hidden"
    >
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border-0 sm:border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[100dvh] sm:max-h-[92dvh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Receipt size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white leading-tight">Pagamento de Fatura</h2>
              <p className="text-[10px] text-slate-400">{card.nickname} •••• {card.last_four || '----'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-800 p-1.5 text-slate-400 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-300 flex items-start gap-2">
              <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Resumo da Fatura */}
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Valor da Fatura a Pagar
            </span>
            <span className="text-2xl sm:text-3xl font-black text-emerald-400 tracking-tight block">
              {formatMoney(amountToPay)}
            </span>
            <span className="text-[10px] text-slate-500 mt-1 block">
              Ciclo: Vencimento dia {card.due_day || '05'}
            </span>
          </div>

          {/* Seleção de Conta para Débito */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Debitar da Conta:
            </label>
            {!accounts.length ? (
              <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-300">
                Cadastre uma conta bancária na carteira para efetuar o pagamento.
              </div>
            ) : (
              <div className="space-y-2">
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-white outline-none focus:border-emerald-500"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.nickname} · Saldo: {formatMoney(acc.balance)}
                    </option>
                  ))}
                </select>

                {selectedAccount && (
                  <div className="flex items-center justify-between px-1 text-[11px] text-slate-400">
                    <span>Saldo disponível:</span>
                    <strong className={selectedAccount.balance >= amountToPay ? 'text-emerald-400' : 'text-amber-400'}>
                      {formatMoney(selectedAccount.balance)}
                    </strong>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg bg-slate-950/60 border border-slate-800/80 p-3 text-[11px] text-slate-400 space-y-1">
            <p className="flex items-center gap-1.5 text-slate-300 font-semibold">
              <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
              Controle Real de Gastos:
            </p>
            <p className="text-[10px] leading-relaxed">
              Ao confirmar o pagamento, o saldo da conta selecionada é abatido e o limite utilizado do cartão é liberado imediatamente.
            </p>
          </div>

          {/* Actions */}
          <div className="pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white text-xs font-bold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !selectedAccountId || amountToPay <= 0}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-emerald-950/40 disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Confirmar Pagamento
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
