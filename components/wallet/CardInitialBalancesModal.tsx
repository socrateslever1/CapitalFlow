import React, { useId, useRef, useState } from 'react';
import type { PersonalWalletCard } from '../../services/personalWallet.service';
import { personalWalletService } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { generateUUID } from '../../utils/generators';
import { formatWalletMoneyInput, parseWalletMoney } from '../../features/wallet/utils/parseWalletMoney';
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
  Number.isFinite(value) && value !== 0 ? formatWalletMoneyInput((Math.round(value * 100) / 100).toFixed(2)) : '';

const moneyCentsOrNull = (value: string): number | null => {
  try {
    if (String(value ?? '').trim() === '') return null;
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
  const futureCents =
    Math.round(Number(card.initial_future_installments_balance || 0) * 100) +
    Math.round(nativeFutureCommitments * 100);
  const initialUsed = Math.max(
    Math.round(Number(card.used_limit || 0) * 100),
    Math.round(invoice * 100) + futureCents,
  ) / 100;
  const [limit, setLimit] = useState(toInputMoney(Number(card.credit_limit || 0)));
  const [used, setUsed] = useState(toInputMoney(initialUsed));
  const [bill, setBill] = useState(toInputMoney(invoice));
  const [usedManuallyEdited, setUsedManuallyEdited] = useState(
    () => Math.round(initialUsed * 100) > Math.round(invoice * 100) + futureCents,
  );
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

  const handleBillChange = (rawBill: string) => {
    changed();
    setBill(rawBill);
    const billCents = moneyCentsOrNull(rawBill);
    if (billCents === null) {
      if (!usedManuallyEdited) setUsed('');
      return;
    }
    const autoUsedCents = billCents + futureCents;
    const currentUsedCents = moneyCentsOrNull(used);
    if (!usedManuallyEdited || currentUsedCents === null || currentUsedCents < autoUsedCents) {
      setUsed(formatWalletMoneyInput((autoUsedCents / 100).toFixed(2)));
    }
  };

  const totalCents = moneyCentsOrNull(limit);
  const billCents = moneyCentsOrNull(bill);
  const rawUsedCents = moneyCentsOrNull(used);
  const usedCents = rawUsedCents !== null
    ? rawUsedCents
    : (billCents !== null ? billCents + futureCents : null);
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
      const currentInvoice = parseWalletMoney(bill || '0', 'fatura atual');
      const usedLimit = parseWalletMoney(used.trim() !== '' ? used : ((Math.round(currentInvoice * 100) + futureCents) / 100).toFixed(2), 'limite usado');
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
          Informe o limite total e a fatura atual: o limite usado é preenchido automaticamente (você pode ajustá-lo se tiver parcelas de meses futuros no cartão).
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-300">
            Limite total (R$)
            <input required type="text" inputMode="decimal" placeholder="0,00" value={limit}
              onChange={(e) => { changed(); setLimit(e.target.value); }}
              onBlur={(e) => { try { setLimit(formatWalletMoneyInput(e.target.value)); } catch { } }}
              className={field} />
          </label>
          <label className="text-xs text-slate-300">
            Fatura atual (R$)
            <input required type="text" inputMode="decimal" placeholder="0,00" value={bill}
              onChange={(e) => handleBillChange(e.target.value)}
              onBlur={(e) => {
                try {
                  const formatted = formatWalletMoneyInput(e.target.value);
                  setBill(formatted);
                  const bCents = moneyCentsOrNull(formatted);
                  if (bCents !== null && !usedManuallyEdited) {
                    setUsed(formatWalletMoneyInput(((bCents + futureCents) / 100).toFixed(2)));
                  }
                } catch { }
              }}
              className={field} />
          </label>
          <label className="text-xs text-slate-300">
            Limite usado (R$) <span className="text-[10px] text-slate-400">(automático ou edite)</span>
            <input required type="text" inputMode="decimal" placeholder="0,00" value={used}
              onChange={(e) => {
                changed();
                setUsedManuallyEdited(e.target.value.trim() !== '');
                setUsed(e.target.value);
              }}
              onBlur={(e) => { try { setUsed(formatWalletMoneyInput(e.target.value)); } catch { } }}
              className={field} />
          </label>
          <label className="text-xs text-slate-300">
            Mês de pagamento (vencimento)
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
          <strong className="text-emerald-300 tabular-nums">
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
