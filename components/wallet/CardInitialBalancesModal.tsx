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

const placeholderMoney = (value: number): string =>
  Number.isFinite(value) ? new Intl.NumberFormat('pt-BR', {minimumFractionDigits:2,maximumFractionDigits:2}).format(value) : '0,00';

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
  // Empty fields are deliberate: only changes typed by the user replace saved values.
  const [limit, setLimit] = useState('');
  const [used, setUsed] = useState('');
  const [bill, setBill] = useState('');
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

  const totalCents = moneyCentsOrNull(limit.trim() || String(Number(card.credit_limit || 0)));
  const usedCents = moneyCentsOrNull(used.trim() || String(initialUsed));
  const differenceCents = totalCents === null || usedCents === null
    ? null : totalCents - usedCents;
  const freeCredit = differenceCents === null ? null : Math.max(0, differenceCents) / 100;
  const excess = differenceCents === null ? null : Math.max(0, -differenceCents) / 100;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setError('');
    try {
      const creditLimit = parseWalletMoney(limit.trim() || String(Number(card.credit_limit || 0)), 'limite total');
      const usedLimit = parseWalletMoney(used.trim() || String(initialUsed), 'limite usado');
      const currentInvoice = parseWalletMoney(bill.trim() || String(invoice), 'fatura atual');
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
        <p className="text-xs text-slate-400">Preencha apenas o que deseja alterar. Valores vazios permanecem como estão.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-300">
            Limite total (R$)
            <input name="wallet-initial-limit" type="text" inputMode="decimal" autoComplete="off" placeholder={placeholderMoney(Number(card.credit_limit || 0))} value={limit}
              onChange={(e) => { changed(); setLimit(e.target.value); }}
              className={field} />
          </label>
          <label className="text-xs text-slate-300">
            Limite usado (R$)
            <input name="wallet-initial-used" type="text" inputMode="decimal" autoComplete="off" placeholder={placeholderMoney(initialUsed)} value={used}
              onChange={(e) => { changed(); setUsed(e.target.value); }}
              className={field} />
          </label>
          <label className="text-xs text-slate-300">
            Fatura atual (R$)
            <input name="wallet-initial-bill" type="text" inputMode="decimal" autoComplete="off" placeholder={placeholderMoney(invoice)} value={bill}
              onChange={(e) => { changed(); setBill(e.target.value); }}
              className={field} />
          </label>
          <label className="text-xs text-slate-300">
            Mês de pagamento (vencimento)
            <input required type="month" min="2000-01" max="2100-12"
              value={month} onChange={(e) => { changed(); setMonth(e.target.value); }}
              className={field} />
          </label>
          <label className="text-xs text-slate-300">
            Situação
            <select value={state} className={field}
              onChange={(e) => { changed(); setState(e.target.value as 'OPEN' | 'CLOSED'); }}>
              <option value="OPEN">Aberta</option>
              <option value="CLOSED">Fechada</option>
            </select>
          </label>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
          <span>Disponível: </span>
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
        <p className="text-[11px] text-slate-500">Use vírgula ou ponto: 0000,00 · 0.000,00</p>
        {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      </form>
    </Modal>
  );
};
export default CardInitialBalancesModal;
