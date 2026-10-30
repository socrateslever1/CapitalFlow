import React, { useId, useRef, useState } from 'react';
import type { PersonalWalletCard } from '../../services/personalWallet.service';
import { personalWalletService } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { generateUUID } from '../../utils/generators';
import { parseWalletMoney } from '../../features/wallet/utils/parseWalletMoney';
import { Modal, modalPrimaryActionClass } from '../ui/Modal';
import { calculateCardOpening } from './cardOpeningSummary';

export interface CardInitialBalancesModalProps {
  card: PersonalWalletCard;
  initialDueMonth?: string | null;
  currentInvoiceAmount?: number;
  nativeFutureCommitments?: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

const toInputMoney = (value: number): string =>
  Number.isFinite(value) ? (Math.round(value * 100) / 100).toFixed(2) : '0.00';

const moneyCentsOrNull = (value: string): number | null => {
  try {
    return Math.round(parseWalletMoney(value) * 100);
  } catch {
    return null;
  }
};

export const CardInitialBalancesModal: React.FC<CardInitialBalancesModalProps> = ({
  card, initialDueMonth, currentInvoiceAmount,
  nativeFutureCommitments = 0, onClose, onSaved,
}) => {
  const formId = useId();
  const invoice = currentInvoiceAmount ?? Number(card.current_bill || 0);
  const initialUsed = Math.max(
    Math.round(Number(card.used_limit || 0) * 100),
    Math.round(invoice * 100) +
      Math.round(Number(card.initial_future_installments_balance || 0) * 100) +
      Math.round(nativeFutureCommitments * 100),
  ) / 100;
  const [limit, setLimit] = useState(toInputMoney(Number(card.credit_limit || 0)));
  const [used, setUsed] = useState(toInputMoney(initialUsed));
  const [bill, setBill] = useState(toInputMoney(invoice));
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

  const totalCents = moneyCentsOrNull(limit);
  const usedCents = moneyCentsOrNull(used);
  const differenceCents = totalCents === null || usedCents === null
    ? null : totalCents - usedCents;
  const freeCredit = differenceCents === null ? null : Math.max(0, differenceCents) / 100;
  const excess = differenceCents === null ? null : Math.max(0, -differenceCents) / 100;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setError('');
    try {
      const creditLimit = parseWalletMoney(limit, 'limite total');
      const usedLimit = parseWalletMoney(used, 'limite usado');
      const currentInvoice = parseWalletMoney(bill, 'fatura atual');
      calculateCardOpening(creditLimit, usedLimit, currentInvoice, nativeFutureCommitments);
      setSaving(true);
      await personalWalletService.setSimpleCardOpening({
        cardId: card.id, creditLimit, usedLimit, currentInvoice,
        dueMonth: month + '-01', invoiceState: state,
        requestId: request.current,
      });
      await onSaved();
      window.dispatchEvent(new Event('capitalflow:wallet-updated'));
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };
  const field =
    'mt-1 w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white';

  return (
    <Modal
      title="Situação inicial do cartão"
      subtitle={card.nickname}
      onClose={onClose}
      busy={saving}
      size="md"
      footer={
        <button
          type="submit" form={formId} disabled={saving}
          className={modalPrimaryActionClass}
        >
          {saving ? 'Salvando...' : 'Salvar situação inicial'}
        </button>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        <p className="text-xs text-slate-400">
          Informe os valores do banco. O limite usado já inclui a fatura atual.
          A disponibilidade abaixo é calculada e não substitui o saldo informado pelo emissor.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-300">
            Limite total (R$)
            <input required type="text" inputMode="decimal" value={limit}
              onChange={(e) => { changed(); setLimit(e.target.value); }}
              className={field} />
          </label>
          <label className="text-xs text-slate-300">
            Limite usado (R$)
            <input required type="text" inputMode="decimal" value={used}
              onChange={(e) => { changed(); setUsed(e.target.value); }}
              className={field} />
          </label>
          <label className="text-xs text-slate-300">
            Fatura atual (R$)
            <input required type="text" inputMode="decimal" value={bill}
              onChange={(e) => { changed(); setBill(e.target.value); }}
              className={field} />
          </label>
          <label className="text-xs text-slate-300">
            Mês da fatura
            <input required type="month" min="2000-01" max="2100-12"
              value={month} onChange={(e) => { changed(); setMonth(e.target.value); }}
              className={field} />
          </label>
          <label className="text-xs text-slate-300">
            Situação da fatura
            <select value={state} className={field}
              onChange={(e) => { changed(); setState(e.target.value as 'OPEN' | 'CLOSED'); }}>
              <option value="OPEN">Aberta</option>
              <option value="CLOSED">Fechada</option>
            </select>
          </label>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
          <span>Disponível calculado para compras: </span>
          <strong className="text-emerald-300">
            {freeCredit === null ? '—' : formatMoney(freeCredit)}
          </strong>
          {excess !== null && excess > 0 && (
            <p role="status" className="mt-2 text-amber-300">
              Limite excedido em {formatMoney(excess)}. Confirme esse excesso no aplicativo do banco.
              Não há crédito disponível para novas compras.
            </p>
          )}
        </div>
        <p className="text-xs text-slate-400">
          Posteriormente, detalhe as compras ou importe a fatura para conciliar os
          valores iniciais, sem registrar o total da fatura como nova compra.
        </p>
        {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      </form>
    </Modal>
  );
};
export default CardInitialBalancesModal;
