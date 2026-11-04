import React, { useId, useRef, useState } from 'react';
import type { PersonalWalletCard } from '../../services/personalWallet.service';
import { personalWalletService } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { generateUUID } from '../../utils/generators';
import { formatWalletMoneyInput, parseWalletMoney } from '../../features/wallet/utils/parseWalletMoney';
import { Modal, modalPrimaryActionClass } from '../ui/Modal';
import { calculateCardOpening, calculateUsedFromAvailable } from './cardOpeningSummary';

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
  // A fatura não determina quanto do limite do cartão está comprometido.
  const [available, setAvailable] = useState('');
  const [positionSource, setPositionSource] = useState<'INVOICE' | 'AVAILABLE' | 'USED'>(
    () => Math.round(initialUsed * 100) > Math.round(invoice * 100) + futureCents
      ? 'USED' : 'INVOICE',
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
    // Valores já informados pelo banco ou editados manualmente são preservados.
    if (positionSource !== 'INVOICE') return;
    const cents = moneyCentsOrNull(rawBill);
    setUsed(cents === null ? '' : formatWalletMoneyInput(((cents + futureCents) / 100).toFixed(2)));
  };

  const handleAvailableChange = (rawAvailable: string) => {
    changed();
    setAvailable(rawAvailable);
    setPositionSource(rawAvailable.trim() ? 'AVAILABLE' : 'INVOICE');
    if (!rawAvailable.trim()) {
      const cents = moneyCentsOrNull(bill);
      setUsed(cents === null ? '' : formatWalletMoneyInput(((cents + futureCents) / 100).toFixed(2)));
    }
  };

  const totalCents = moneyCentsOrNull(limit);
  const billCents = moneyCentsOrNull(bill);
  const availableCents = moneyCentsOrNull(available);
  const bankAvailableEntered = positionSource === 'AVAILABLE' && available.trim() !== '';
  const rawUsedCents = moneyCentsOrNull(used);
  const usedCents = bankAvailableEntered
    ? totalCents !== null && availableCents !== null && availableCents <= totalCents
      ? totalCents - availableCents : null
    : rawUsedCents !== null ? rawUsedCents
      : positionSource === 'INVOICE' && billCents !== null ? billCents + futureCents : null;
  const displayedUsed = bankAvailableEntered
    ? usedCents === null ? '' : formatWalletMoneyInput((usedCents / 100).toFixed(2))
    : used;
  const invalidAvailable = bankAvailableEntered && totalCents !== null &&
    availableCents !== null && availableCents > totalCents;
  const insufficientUsed = usedCents !== null && billCents !== null &&
    usedCents < billCents + futureCents;
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
      const usedLimit = bankAvailableEntered
        ? calculateUsedFromAvailable(creditLimit, parseWalletMoney(available, 'limite disponível'))
        : parseWalletMoney(
          used.trim() !== '' ? used : ((Math.round(currentInvoice * 100) + futureCents) / 100).toFixed(2),
          'limite usado',
        );
      if (Math.round(usedLimit * 100) < Math.round(currentInvoice * 100) + futureCents) {
        throw new Error('O limite usado precisa incluir a fatura atual e os gastos futuros já cadastrados.');
      }
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
          Informe o limite disponível exibido pelo banco. O limite usado será calculado pela diferença com o limite total.
          A fatura atual é separada: ela não representa necessariamente todo o limite comprometido.
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
                  if (bCents !== null && positionSource === 'INVOICE') {
                    setUsed(formatWalletMoneyInput(((bCents + futureCents) / 100).toFixed(2)));
                  }
                } catch { }
              }}
              className={field} />
          </label>
          <label className="text-xs text-slate-300">
            Limite disponível no banco (R$)
            <input name="wallet-card-available-limit" type="text" inputMode="decimal"
              placeholder="Informe o valor disponível" value={available}
              onChange={e => handleAvailableChange(e.target.value)}
              onBlur={e => {
                try { setAvailable(formatWalletMoneyInput(e.target.value)); } catch { }
              }}
              className={field} />
            <span className="mt-1 block text-[11px] text-slate-400">
              Confira no aplicativo do banco. Ao preencher, recalculamos o limite usado.
            </span>
          </label>
          <label className="text-xs text-slate-300">
            Limite usado (R$) <span className="text-[10px] text-slate-400">(calculado ou edite)</span>
            <input required type="text" inputMode="decimal" placeholder="0,00" value={displayedUsed}
              onChange={(e) => {
                changed();
                setAvailable('');
                setPositionSource(e.target.value.trim() ? 'USED' : 'INVOICE');
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
          <span>{bankAvailableEntered ? 'Disponível informado pelo banco: ' : 'Disponível estimado para compras: '}</span>
          <strong className="text-emerald-300 tabular-nums">
            {freeCredit === null ? '—' : formatMoney(freeCredit)}
          </strong>
          {invalidAvailable && (
            <p role="alert" className="mt-2 text-rose-300">
              O disponível informado não pode superar o limite total.
            </p>
          )}
          {insufficientUsed && (
            <p role="alert" className="mt-2 text-rose-300">
              O limite usado precisa incluir a fatura e os compromissos futuros já cadastrados.
              Confira o disponível informado pelo banco.
            </p>
          )}
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
