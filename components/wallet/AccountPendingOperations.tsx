import React, { useRef, useState } from 'react';
import { Clock3, Plus } from 'lucide-react';
import { personalWalletService, type WalletPendingOperation } from '../../services/personalWallet.service';
import { formatWalletMoneyInput, parseWalletMoney } from '../../features/wallet/utils/parseWalletMoney';
import { generateUUID } from '../../utils/generators';
import { businessDateInManaus } from '../../utils/businessDate';
import { PrivateMoney } from '../../contexts/FinancialPrivacyContext';

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const input = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white';

/**
 * Lançamentos pendentes da conta (pendente × efetivado). Pendente não altera saldo nem extrato;
 * efetivar (total ou parcial) cria a movimentação real na mesma operação do banco.
 */
export const AccountPendingOperations: React.FC<{
  accountId: string;
  pending: WalletPendingOperation[];
  onSaved: () => Promise<void>;
}> = ({ accountId, pending, onSaved }) => {
  const rows = pending.filter(item => item.account_id === accountId && item.status === 'PENDING');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ direction: 'IN' as 'IN' | 'OUT', description: '', amount: '', date: businessDateInManaus(), category: '' });
  const [posting, setPosting] = useState<{ id: string; amount: string; date: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const createRequest = useRef(generateUUID());
  const postRequest = useRef<{ key: string; id: string } | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); await onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível concluir.'); }
    finally { setBusy(false); }
  };

  return <section className="rounded-xl border border-slate-800 bg-slate-900 p-3 sm:p-4" aria-label="Lançamentos pendentes">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-bold text-white"><Clock3 size={16} className="text-amber-300" /> Pendentes</h3>
      <button type="button" onClick={() => { setCreating(value => !value); setError(''); }}
        className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-700 px-2.5 text-xs font-semibold text-slate-200 hover:border-slate-500">
        <Plus size={14} /> Lançamento pendente
      </button>
    </div>
    <p className="mt-1 text-[11px] leading-relaxed text-slate-400">Pendente não muda o saldo nem o extrato. Ao efetivar, o valor entra ou sai da conta. Não repita aqui receitas fixas já cadastradas: elas já entram no previsto.</p>

    {creating && <form className="mt-3 grid gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3 sm:grid-cols-2"
      onSubmit={event => {
        event.preventDefault();
        void run(async () => {
          const amount = parseWalletMoney(form.amount, 'valor');
          if (!form.description.trim()) throw new Error('Informe a descrição.');
          await personalWalletService.createPendingOperation({
            accountId, direction: form.direction, amount, description: form.description.trim(),
            category: form.category.trim() || 'Outros', expectedDate: form.date, requestId: createRequest.current,
          });
          createRequest.current = generateUUID();
          setForm(value => ({ ...value, description: '', amount: '', category: '' }));
          setCreating(false);
        });
      }}>
      <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-2 gap-2 sm:col-span-2">
        {([['IN', 'Entrada'], ['OUT', 'Saída']] as const).map(([value, label]) =>
          <button key={value} type="button" role="radio" aria-checked={form.direction === value}
            onClick={() => { createRequest.current = generateUUID(); setForm(f => ({ ...f, direction: value })); }}
            className={`min-h-10 rounded-lg border text-xs font-semibold ${form.direction === value ? 'border-blue-400 bg-blue-500/15 text-blue-100' : 'border-slate-700 text-slate-300'}`}>{label}</button>)}
      </div>
      <label className="text-xs text-slate-300 sm:col-span-2">Descrição
        <input required maxLength={240} value={form.description} className={input}
          onChange={e => { createRequest.current = generateUUID(); setForm(f => ({ ...f, description: e.target.value })); }} />
      </label>
      <label className="text-xs text-slate-300">Valor (R$)
        <input required inputMode="decimal" placeholder="0,00" value={form.amount} className={input}
          onChange={e => { createRequest.current = generateUUID(); setForm(f => ({ ...f, amount: e.target.value })); }} />
      </label>
      <label className="text-xs text-slate-300">Data prevista
        <input required type="date" value={form.date} className={input}
          onChange={e => { createRequest.current = generateUUID(); setForm(f => ({ ...f, date: e.target.value })); }} />
      </label>
      <label className="text-xs text-slate-300 sm:col-span-2">Categoria (opcional)
        <input maxLength={100} value={form.category} placeholder="Outros" className={input}
          onChange={e => { createRequest.current = generateUUID(); setForm(f => ({ ...f, category: e.target.value })); }} />
      </label>
      <button type="submit" disabled={busy} className="min-h-10 rounded-lg bg-blue-600 text-xs font-semibold text-white disabled:opacity-50 sm:col-span-2">
        {busy ? 'Salvando…' : 'Salvar como pendente'}
      </button>
    </form>}

    {error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}

    {rows.length === 0 ? <p className="mt-3 text-xs text-slate-500">Nenhum lançamento pendente.</p>
      : <ul className="mt-3 divide-y divide-slate-800">
        {rows.map(item => {
          const remaining = Math.round((item.amount - item.posted_amount) * 100) / 100;
          const open = posting?.id === item.id;
          return <li key={item.id} className="py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-100">{item.description}</p>
                <p className="text-[11px] text-slate-400">
                  {item.direction === 'IN' ? 'Entrada' : 'Saída'} prevista {brDate(item.expected_date)}
                  {item.posted_amount > 0 && <> · efetivado <PrivateMoney value={money(item.posted_amount)} /> de <PrivateMoney value={money(item.amount)} /></>}
                </p>
              </div>
              <span className={`shrink-0 text-xs font-bold tabular-nums ${item.direction === 'IN' ? 'text-emerald-300' : 'text-rose-300'}`}>
                {item.direction === 'IN' ? '+ ' : '− '}<PrivateMoney value={money(remaining)} />
              </span>
            </div>
            {!open && <div className="mt-2 flex justify-end gap-2">
              <button type="button" disabled={busy}
                onClick={() => run(async () => { await personalWalletService.cancelPendingOperation(item.id); })}
                className="min-h-8 rounded-md border border-slate-700 px-2.5 text-[11px] font-semibold text-slate-300 disabled:opacity-40">Cancelar</button>
              <button type="button" disabled={busy}
                onClick={() => { setError(''); setPosting({ id: item.id, amount: formatWalletMoneyInput(String(remaining)), date: businessDateInManaus() }); }}
                className="min-h-8 rounded-md bg-emerald-600 px-2.5 text-[11px] font-semibold text-white disabled:opacity-40">Efetivar</button>
            </div>}
            {open && posting && <form className="mt-2 grid gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2.5 sm:grid-cols-[1fr_1fr_auto]"
              onSubmit={event => {
                event.preventDefault();
                void run(async () => {
                  const amount = parseWalletMoney(posting.amount, 'valor');
                  const key = `${item.id}:${amount}:${posting.date}`;
                  if (postRequest.current?.key !== key) postRequest.current = { key, id: generateUUID() };
                  await personalWalletService.postPendingOperation({ pendingId: item.id, amount, date: posting.date, requestId: postRequest.current.id });
                  postRequest.current = null;
                  setPosting(null);
                });
              }}>
              <label className="text-[11px] text-slate-300">Valor efetivado
                <input inputMode="decimal" value={posting.amount} className={input}
                  onChange={e => setPosting(p => p && ({ ...p, amount: e.target.value }))} />
              </label>
              <label className="text-[11px] text-slate-300">Data
                <input type="date" value={posting.date} className={input}
                  onChange={e => setPosting(p => p && ({ ...p, date: e.target.value }))} />
              </label>
              <div className="flex items-end gap-2">
                <button type="button" onClick={() => setPosting(null)} className="min-h-10 rounded-lg border border-slate-700 px-3 text-xs text-slate-300">Voltar</button>
                <button type="submit" disabled={busy} className="min-h-10 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white disabled:opacity-50">{busy ? '…' : 'Confirmar'}</button>
              </div>
              <p className="text-[11px] text-slate-500 sm:col-span-3">Valor menor que o pendente efetiva só uma parte; o restante continua pendente.</p>
            </form>}
          </li>;
        })}
      </ul>}
  </section>;
};
