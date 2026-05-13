
// src/components/modals/NewAporteModal.tsx
import React, { useMemo, useState } from 'react';
import { X, PlusCircle, ChevronDown } from 'lucide-react';
import { Loan, UserProfile, CapitalSource, Installment } from '../../types';
import { contractsService } from '../../services/contracts.service';
import { formatMoney, cleanNumberStr } from '../../utils/formatters';

type Props = {
  open: boolean;
  onClose: () => void;
  loan: Loan;
  activeUser: UserProfile;
  sources: CapitalSource[];
  installments: Installment[];
  onSuccess?: () => void;
  isStealthMode?: boolean;
};

export const NewAporteModal: React.FC<Props> = ({
  open,
  onClose,
  loan,
  activeUser,
  sources,
  installments,
  onSuccess,
  isStealthMode,
}) => {
  const [amount, setAmount] = useState<string>('');
  const [sourceId, setSourceId] = useState<string>(loan.sourceId || '');
  const [installmentId, setInstallmentId] = useState<string>('');
  const [notes, setNotes] = useState<string>('Renovação - novo aporte');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');

  const pendingInstallments = useMemo(() => {
    return (installments || []).filter((i: any) => String(i.status || '').toUpperCase() !== 'PAID');
  }, [installments]);

  const defaultTargetInstallmentId = useMemo(() => {
    const sorted = [...pendingInstallments].sort((a: any, b: any) => {
      const an = Number(a.numero_parcela ?? a.number ?? 999999);
      const bn = Number(b.numero_parcela ?? b.number ?? 999999);
      if (an !== bn) return an - bn;
      const ad = String(a.data_vencimento ?? a.dueDate ?? '');
      const bd = String(b.data_vencimento ?? b.dueDate ?? '');
      return ad.localeCompare(bd);
    });
    return sorted?.[0]?.id || '';
  }, [pendingInstallments]);

  const parsedAmount = useMemo(() => {
    const raw = amount.trim();
    if (!raw) return 0;
    const normalized = raw.replace(/\./g, '').replace(',', '.');
    const val = Number(normalized);
    return Number.isFinite(val) ? val : 0;
  }, [amount]);

  if (!open) return null;

  const handleConfirm = async () => {
    setErr('');
    if (!parsedAmount || parsedAmount <= 0) {
      setErr('Informe um valor de aporte válido.');
      return;
    }
    if (!sourceId) {
      setErr('Selecione a fonte de origem.');
      return;
    }

    const target = installmentId || defaultTargetInstallmentId;
    if (!target) {
      setErr('Não encontrei parcela pendente para aplicar o aporte.');
      return;
    }

    try {
      setLoading(true);

      await contractsService.addAporte({
        loanId: loan.id,
        amount: parsedAmount,
        sourceId,
        installmentId: target,
        notes,
        activeUser,
      });

      setLoading(false);
      onClose();
      onSuccess?.();
    } catch (e: any) {
      setLoading(false);
      setErr(e?.message || 'Falha ao aplicar aporte.');
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={loading ? undefined : onClose} />

      <div className="relative w-[92vw] max-w-xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-slate-800 shrink-0">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Contrato</p>
            <p className="text-white font-black text-lg flex items-center gap-2">
              <PlusCircle size={18} /> Novo Aporte (Renovação)
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Isso aumenta a dívida do contrato e aplica na parcela pendente (sem recalcular parcelas).
            </p>
          </div>

          <button
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 self-start"
            onClick={loading ? undefined : onClose}
            aria-label="Fechar"
          >
            <X size={16} className="text-slate-300" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto custom-scrollbar space-y-4">
          {/* Valor */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Valor do Aporte</p>
            <input
              value={amount || ''}
              onChange={(e) => setAmount(cleanNumberStr(e.target.value))}
              placeholder="Ex: 1000 ou 1000,50"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-bold outline-none focus:border-blue-500 transition-colors"
            />
            <p className="text-[10px] text-slate-500 mt-2">
              Prévia: <span className="text-slate-300 font-bold">{formatMoney(parsedAmount, isStealthMode)}</span>
            </p>
          </div>

          {/* Fonte */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Fonte (Carteira de Origem)</p>
            <div className="relative group">
                <select
                  value={sourceId || ''}
                  onChange={(e) => setSourceId(e.target.value)}
                  className="w-full appearance-none bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 pr-10 text-white font-bold outline-none focus:border-blue-500 transition-colors cursor-pointer"
                >
                  <option value="" disabled>Selecione uma fonte</option>
                  {sources.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — saldo {formatMoney(Number(s.balance || 0), isStealthMode)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-hover:text-blue-500 transition-colors" size={16}/>
            </div>
          </div>

          {/* Parcela alvo (opcional) */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Aplicar em qual parcela?</p>
            <div className="relative group">
                <select
                  value={installmentId || ''}
                  onChange={(e) => setInstallmentId(e.target.value)}
                  className="w-full appearance-none bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 pr-10 text-white font-bold outline-none focus:border-blue-500 transition-colors cursor-pointer"
                >
                  <option value="">Automático (próxima pendente)</option>
                  {pendingInstallments.map((i: any) => {
                    const n = i.numero_parcela ?? i.number ?? '?';
                    const due = i.data_vencimento ?? i.due_date ?? i.dueDate ?? '';
                    const val = i.valor_parcela ?? i.amount ?? 0;
                    return (
                      <option key={i.id} value={i.id}>
                        Parcela {n} — venc {String(due).slice(0, 10)} — {formatMoney(Number(val || 0), isStealthMode)}
                      </option>
                    );
                  })}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-hover:text-blue-500 transition-colors" size={16}/>
            </div>
            <p className="text-[10px] text-slate-500 mt-2">
              Se deixar automático, vai na próxima parcela PENDING.
            </p>
          </div>

          {/* Observações */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Observações</p>
            <input
              value={notes || ''}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Renovação, cliente pegou mais R$..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-bold outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {err ? (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
              <p className="text-rose-300 text-xs font-bold">{err}</p>
            </div>
          ) : null}
        </div>

        <div className="p-5 border-t border-slate-800 flex gap-2 shrink-0 bg-slate-950">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-black text-xs uppercase tracking-widest hover:bg-blue-500 transition-all disabled:opacity-60"
          >
            {loading ? 'Aplicando...' : 'Confirmar Aporte'}
          </button>
        </div>
      </div>
    </div>
  );
};
