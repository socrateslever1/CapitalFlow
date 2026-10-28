import React, { useRef, useState } from 'react';
import type { PersonalWalletCard } from '../../services/personalWallet.service';
import { personalWalletService } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { generateUUID } from '../../utils/generators';
import {
  Modal,
  modalPrimaryActionClass,
  modalSecondaryActionClass,
} from '../ui/Modal';
import { calculateCardOpening } from './cardOpeningSummary';

export interface CardInitialBalancesModalProps {
  card: PersonalWalletCard;
  initialDueMonth?: string | null;
  currentInvoiceAmount?: number;
  nativeFutureCommitments?: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
}
export const CardInitialBalancesModal: React.FC<
  CardInitialBalancesModalProps
> = ({
  card,
  initialDueMonth,
  currentInvoiceAmount = 0,
  nativeFutureCommitments = 0,
  onClose,
  onSaved,
}) => {
  const invoice = currentInvoiceAmount || Number(card.current_bill || 0);
  const initialUsed = Math.max(
    Number(card.used_limit || 0),
    invoice +
      Number(card.initial_future_installments_balance || 0) +
      nativeFutureCommitments,
  );
  const [limit, setLimit] = useState(String(card.credit_limit));
  const [used, setUsed] = useState(String(initialUsed));
  const [bill, setBill] = useState(String(invoice));
  const [month, setMonth] = useState(
    (initialDueMonth || new Date().toLocaleDateString('en-CA')).slice(0, 7),
  );
  const [state, setState] = useState<'OPEN' | 'CLOSED'>(
    card.opening_invoice_state || 'OPEN',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(generateUUID());
  const changed = () => {
    request.current = generateUUID();
    setError('');
  };
  const available = Math.round((Number(limit) - Number(used)) * 100) / 100;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setError('');
    try {
      calculateCardOpening(
        Number(limit),
        Number(used),
        Number(bill),
        nativeFutureCommitments,
      );
      setSaving(true);
      await personalWalletService.setSimpleCardOpening({
        cardId: card.id,
        creditLimit: Number(limit),
        usedLimit: Number(used),
        currentInvoice: Number(bill),
        dueMonth: month + '-01',
        invoiceState: state,
        requestId: request.current,
      });
      await onSaved();
      window.dispatchEvent(new Event('capitalflow:wallet-updated'));
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Não foi possível salvar.',
      );
    } finally {
      setSaving(false);
    }
  };
  const field =
    'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white';
  return (
    <Modal
      title="Situação inicial do cartão"
      subtitle={card.nickname}
      onClose={onClose}
      busy={saving}
      size="md"
    >
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-slate-400">
          Copie os valores do aplicativo do banco. O limite usado já inclui a
          fatura atual.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-300">
            Limite total (R$)
            <input
              required
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={limit}
              onChange={(e) => {
                changed();
                setLimit(e.target.value);
              }}
              className={field}
            />
          </label>
          <label className="text-xs text-slate-300">
            Limite usado (R$)
            <input
              required
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={used}
              onChange={(e) => {
                changed();
                setUsed(e.target.value);
              }}
              className={field}
            />
          </label>
          <label className="text-xs text-slate-300">
            Disponível para gastar (R$)
            <input
              required
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={available}
              onChange={(e) => {
                changed();
                setUsed(
                  String(
                    Math.round((Number(limit) - Number(e.target.value)) * 100) /
                      100,
                  ),
                );
              }}
              className={field}
            />
          </label>
          <label className="text-xs text-slate-300">
            Fatura atual (R$)
            <input
              required
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={bill}
              onChange={(e) => {
                changed();
                setBill(e.target.value);
              }}
              className={field}
            />
          </label>
          <label className="text-xs text-slate-300">
            Mês da fatura
            <input
              required
              type="month"
              min="2000-01"
              max="2100-12"
              value={month}
              onChange={(e) => {
                changed();
                setMonth(e.target.value);
              }}
              className={field}
            />
          </label>
          <label className="text-xs text-slate-300">
            Situação da fatura
            <select
              value={state}
              onChange={(e) => {
                changed();
                setState(e.target.value as 'OPEN' | 'CLOSED');
              }}
              className={field}
            >
              <option value="OPEN">Aberta</option>
              <option value="CLOSED">Fechada</option>
            </select>
          </label>
        </div>
        <p className="rounded-xl bg-slate-950 p-3 text-xs text-slate-300">
          Disponível:{' '}
          <strong className="text-emerald-300">{formatMoney(available)}</strong>
        </p>
        <p className="text-xs text-slate-400">
          Depois, adicione gastos individualmente ou importe uma fatura. Os
          valores iniciais ficam identificados no extrato.
        </p>
        {error && (
          <p role="alert" className="text-xs text-rose-300">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className={modalSecondaryActionClass}
          >
            Cancelar
          </button>
          <button disabled={saving} className={modalPrimaryActionClass}>
            {saving ? 'Salvando...' : 'Salvar situação inicial'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
export default CardInitialBalancesModal;
