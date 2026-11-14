import React, { useEffect, useState } from 'react';
import { CheckCircle2, History, Loader2, RefreshCw } from 'lucide-react';
import {
  personalWalletService,
  type HistoricalReceiptCandidate,
} from '../../../services/personalWallet.service';
import type { CapitalSource } from '../../../types';
import type { PersonalWalletAccount } from '../../../services/personalWallet.service';
import { formatMoney } from '../../../utils/formatters';

type Props = {
  onSaved: () => Promise<void>;
};

export const HistoricalReceiptReconciliationPanel: React.FC<Props> = ({ onSaved }) => {
  const [items, setItems] = useState<HistoricalReceiptCandidate[]>([]);
  const [accounts, setAccounts] = useState<PersonalWalletAccount[]>([]);
  const [capitalSources, setCapitalSources] = useState<CapitalSource[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [destination, setDestination] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [nextItems, destinations] = await Promise.all([
        personalWalletService.listHistoricalReceiptCandidates(),
        personalWalletService.listHistoricalReceiptDestinations(),
      ]);
      setItems(nextItems); setAccounts(destinations.accounts); setCapitalSources(destinations.capitalSources);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível consultar recebimentos antigos.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const selected = items.find(item => item.operation_id === selectedId);
  const eligibleTotal = items.reduce((sum, item) => sum + Number(item.amount_received || 0), 0);
  const accountLabel = (account: PersonalWalletAccount): string => {
    const created = typeof account.created_at === 'string'
      ? account.created_at.slice(0, 10).split('-').reverse().join('/')
      : '';
    return [account.nickname, created ? `criada ${created}` : null, formatMoney(Number(account.balance))]
      .filter(Boolean).join(' · ');
  };
  const submit = async () => {
    if (!selected || !destination || !reason.trim()) return;
    const [kind, id] = destination.split(':');
    setBusy(true); setError(''); setMessage('');
    try {
      await personalWalletService.reconcileHistoricalReceipt({
        operationId: selected.operation_id,
        destinationAccountId: kind === 'account' ? id : null,
        destinationSourceId: kind === 'source' ? id : null,
        reason,
      });
      setMessage('Recebimento reclassificado e auditado. O registro original foi preservado.');
      setSelectedId(''); setDestination(''); setReason('');
      await load(); await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível reclassificar o recebimento.'); }
    finally { setBusy(false); }
  };

  return <section aria-label="Reconciliação de recebimentos antigos" className="rounded-xl border border-amber-500/25 bg-slate-900 p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-base font-bold text-white"><History size={18} className="text-amber-300"/> Recebimentos anteriores ao destino da Carteira</h2>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-300">Reclassificação contábil de recebimentos do motor V4, sem registrar novamente o pagamento no contrato. Não é uma transferência bancária/PIX. Pagamentos de acordos, como o da Solange, ainda não são contemplados por este mecanismo.</p>
      </div>
      <button type="button" onClick={() => void load()} disabled={loading || busy} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-200 disabled:opacity-50">
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> Atualizar
      </button>
    </div>
    {error && <p role="alert" className="mt-3 rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 text-xs text-rose-200">{error}</p>}
    {message && <p role="status" className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 text-xs text-emerald-200"><CheckCircle2 size={15} className="mt-0.5 shrink-0"/>{message}</p>}
    {!loading && !items.length && !error && <p className="mt-4 rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-300">Nenhum recebimento antigo elegível foi encontrado.</p>}
    {!!items.length && <p className="mt-3 text-sm font-semibold text-white">{items.length} recebimento(s) elegível(is) · total histórico: {formatMoney(eligibleTotal)}. A confirmação é individual e exige conferir o destino e os saldos de origem.</p>}
    {!!items.length && <div className="mt-4 grid gap-3 lg:grid-cols-2">
      <label className="text-xs font-semibold text-slate-200">Recebimento
        <select value={selectedId} onChange={event => setSelectedId(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white">
          <option value="">Selecione para revisar</option>
          {items.map(item => <option key={item.operation_id} value={item.operation_id}>{item.payment_date} · {item.debtor_name || 'Cliente sem nome'} · {formatMoney(Number(item.amount_received))}</option>)}
        </select>
      </label>
      <label className="text-xs font-semibold text-slate-200">Destino
        <select value={destination} onChange={event => setDestination(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white">
          <option value="">Escolha conta ou fonte</option>
          {accounts.filter(account => !account.archived_at).map(account => <option key={account.id} value={`account:${account.id}`}>Conta · {accountLabel(account)}</option>)}
          {capitalSources.map(source => <option key={source.id} value={`source:${source.id}`}>Capital · {source.name}</option>)}
        </select>
      </label>
      {selected && <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300 lg:col-span-2">
        <p><strong className="text-white">Prévia:</strong> {formatMoney(Number(selected.amount_received))} = capital {formatMoney(Number(selected.principal_paid))} + lucro/encargos {formatMoney(Number(selected.interest_paid) + Number(selected.late_fee_paid))}.</p>
        <p className="mt-1">Origem atual: {selected.principal_source_name || 'fonte não informada'}{selected.profit_source_name ? ` · lucro em ${selected.profit_source_name}` : ''}.</p>
      </div>}
      <label className="text-xs font-semibold text-slate-200 lg:col-span-2">Motivo da conciliação
        <textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={500} rows={2} placeholder="Ex.: recebimento anterior à ativação da escolha de destino" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"/>
      </label>
      <button type="button" onClick={() => void submit()} disabled={busy || !selected || !destination || !reason.trim()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 lg:col-span-2">
        {busy && <Loader2 size={15} className="animate-spin"/>} Confirmar reclassificação auditada
      </button>
    </div>}
  </section>;
};
