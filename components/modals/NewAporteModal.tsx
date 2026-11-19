
// src/components/modals/NewAporteModal.tsx
import React, { useMemo, useState } from 'react';
import { Modal, modalPrimaryActionClass } from '../ui/Modal';
import { SelectOptionList } from '../ui/SelectOptionList';
import { PlusCircle } from 'lucide-react';
import { Loan, UserProfile, CapitalSource, Installment } from '../../types';
import { contractsService } from '../../services/contracts.service';
import { formatMoney, cleanNumberStr, parseCurrency } from '../../utils/formatters';
import { canReceiveCapitalAdvance } from '../../domain/finance/capitalAdvance';

type Props = {
  open: boolean;
  onClose: () => void;
  loan: Loan;
  activeUser: UserProfile;
  sources: CapitalSource[];
  installments: Installment[];
  onSuccess?: () => void | Promise<void>;
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
  const [notes, setNotes] = useState<string>('Novo aporte');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');

  const pendingInstallments = useMemo(() => {
    return (installments || []).filter((i: any) => {
      const status = String(i.status || '').toUpperCase();
      const open =
        Number(i.principalRemaining ?? i.principal_remaining ?? 0) +
        Number(i.interestRemaining ?? i.interest_remaining ?? 0) +
        Number(i.lateFeeAccrued ?? i.late_fee_accrued ?? 0);
      return canReceiveCapitalAdvance(status, open);
    });
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
    const val = parseCurrency(raw);
    return Number.isFinite(val) ? val : 0;
  }, [amount]);
  const selectedSource = useMemo(() => sources.find((source) => source.id === sourceId), [sourceId, sources]);
  const projectedSourceBalance = Number(selectedSource?.balance || 0) - parsedAmount;

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

      await onSuccess?.();
      setLoading(false);
      onClose();
    } catch (e: any) {
      setLoading(false);
      setErr(e?.message || 'Falha ao aplicar aporte.');
    }
  };

  return (
    <Modal onClose={onClose} title="Novo Aporte" icon={<PlusCircle size={22} />} size="md"
      subtitle="Aumenta o capital do contrato e o saldo da parcela escolhida. Não depende da modalidade do contrato." busy={loading}
      footer={<button type="button" onClick={handleConfirm} disabled={loading} className={modalPrimaryActionClass}>{loading ? 'Aplicando...' : 'Confirmar Aporte'}</button>}>
      <div className="space-y-4">
          {/* Valor */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Valor do Aporte</p>
            <input
              value={amount || ''}
              onChange={(e) => setAmount(cleanNumberStr(e.target.value))}
              placeholder="Ex: 1000 ou 1000,50"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-bold outline-none focus:border-blue-500 transition-colors"
            />
            <p className="text-[10px] text-slate-500 mt-2">
              Novo capital adicionado: <span className="text-slate-300 font-bold">{formatMoney(parsedAmount, isStealthMode)}</span>
            </p>
          </div>

          {/* Fonte */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Fonte (Carteira de Origem)</p>
            <SelectOptionList
              ariaLabel="Fonte de origem"
              value={sourceId || ''}
              placeholder="Selecione uma fonte"
              options={sources.map((s: any) => ({
                value: s.id,
                label: s.name,
                subtitle: 'Saldo atual',
                rightValue: formatMoney(Number(s.balance || 0), isStealthMode),
              }))}
              onChange={setSourceId}
            />
            {selectedSource && parsedAmount > 0 && <p className={`mt-2 text-[10px] font-bold ${projectedSourceBalance < 0 ? 'text-amber-300' : 'text-slate-500'}`}>Saldo da fonte após o aporte: {formatMoney(projectedSourceBalance, isStealthMode)}{projectedSourceBalance < 0 ? ' — ficará negativo' : ''}</p>}
          </div>

          {/* Parcela alvo (opcional) */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Aplicar em qual parcela?</p>
            <SelectOptionList
              ariaLabel="Aplicar em qual parcela"
              value={installmentId || ''}
              placeholder="Automático (próxima pendente)"
              clearable
              emptyHint="Sem seleção: o aporte será incluído na próxima parcela em aberto."
              options={pendingInstallments.map((i: any) => {
                const n = i.numero_parcela ?? i.number ?? '?';
                const due = i.data_vencimento ?? i.due_date ?? i.dueDate ?? '';
                const val = i.valor_parcela ?? i.amount ?? 0;
                return {
                  value: i.id,
                  label: `Parcela ${n}`,
                  subtitle: `Vencimento ${String(due).slice(0, 10)}`,
                  rightValue: formatMoney(Number(val || 0), isStealthMode),
                };
              })}
              onChange={setInstallmentId}
            />
          </div>

          {/* Observações */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Observações</p>
            <input
              value={notes || ''}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Renovação, cliente pegou mais R$..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-bold outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {err ? (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3">
              <p className="text-rose-300 text-xs font-bold">{err}</p>
            </div>
          ) : null}
        </div>

    </Modal>
  );
};
