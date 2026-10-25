import React, { useMemo, useState } from 'react';
import { Building2, CalendarClock, CheckCircle2, FileUp, HandCoins, Plus, UserRound, X } from 'lucide-react';
import { PersonalWalletAccount, PersonalWalletPayable } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { derivePayableStatus, summarizePayables } from './payablesDomain';

type Props = {
  payables: PersonalWalletPayable[];
  accounts: PersonalWalletAccount[];
  saving: boolean;
  onCreate: () => void;
  onPay: (input: { payableId: string; accountId: string | null; amount: number; receipt: File | null }) => Promise<void>;
};

const labels = { PENDING: 'Pendente', PARTIAL: 'Parcial', PAID: 'Liquidado', OVERDUE: 'Atrasado', CANCELED: 'Cancelado' } as const;
const statusClass = { PENDING: 'bg-amber-500/10 text-amber-300', PARTIAL: 'bg-blue-500/10 text-blue-300', PAID: 'bg-emerald-500/10 text-emerald-300', OVERDUE: 'bg-rose-500/10 text-rose-300', CANCELED: 'bg-slate-700 text-slate-300' } as const;

export const WalletPayablesPanel: React.FC<Props> = ({ payables, accounts, saving, onCreate, onPay }) => {
  const summary = useMemo(() => summarizePayables(payables), [payables]);
  const [selected, setSelected] = useState<PersonalWalletPayable | null>(null);
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);

  const close = () => { setSelected(null); setAmount(''); setAccountId(''); setReceipt(null); };
  return <div className="space-y-3 animate-in fade-in">
    <div className="grid grid-cols-3 gap-2">
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3"><span className="text-[9px] font-black uppercase text-slate-500">Passivo aberto</span><strong className="mt-1 block text-sm text-rose-300">{formatMoney(summary.total)}</strong><small className="text-[9px] text-slate-500">{summary.openCount} obrigação(ões)</small></div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3"><span className="text-[9px] font-black uppercase text-slate-500">Vencido</span><strong className="mt-1 block text-sm text-amber-300">{formatMoney(summary.overdue)}</strong><small className="text-[9px] text-slate-500">exige atenção</small></div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3"><span className="text-[9px] font-black uppercase text-slate-500">Próx. 30 dias</span><strong className="mt-1 block text-sm text-blue-300">{formatMoney(summary.next30Days)}</strong><small className="text-[9px] text-slate-500">projeção de caixa</small></div>
    </div>
    <div className="flex items-center justify-between px-1"><h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400"><HandCoins size={15} className="text-rose-400"/>Contas a pagar</h2><button type="button" onClick={onCreate} className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-300"><Plus size={13}/>Nova dívida</button></div>
    {!payables.length ? <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-500">Nenhuma dívida contraída cadastrada.</div> : <div className="space-y-2">{payables.map(payable => {
      const status = derivePayableStatus(payable);
      return <article key={payable.id} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-800 text-slate-300">{payable.creditor_type === 'COMPANY' ? <Building2 size={17}/> : <UserRound size={17}/>}</span><div className="min-w-0"><strong className="block truncate text-sm text-white">{payable.creditor_name}</strong><p className="truncate text-[10px] text-slate-400">{payable.description}</p>{payable.creditor_document && <small className="text-[9px] text-slate-500">{payable.creditor_document}</small>}</div></div><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${statusClass[status]}`}>{labels[status]}</span></div>
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-800 pt-3 text-[10px]"><div><span className="block text-slate-500">Total</span><strong className="text-slate-200">{formatMoney(payable.total_amount)}</strong></div><div><span className="block text-slate-500">Saldo devedor</span><strong className="text-rose-300">{formatMoney(payable.outstanding_balance)}</strong></div><div><span className="block text-slate-500">Vencimento</span><strong className="text-slate-200">{payable.due_date ? new Date(`${payable.due_date}T12:00:00`).toLocaleDateString('pt-BR') : 'Sem data'}</strong></div></div>
        {(Number(payable.interest_rate) > 0 || Number(payable.fine_percent) > 0) && <p className="mt-2 text-[9px] text-amber-300">Juros {Number(payable.interest_rate).toLocaleString('pt-BR')}% a.m. · Multa {Number(payable.fine_percent).toLocaleString('pt-BR')}%</p>}
        {!['PAID','CANCELED'].includes(status) && <button type="button" onClick={() => { setSelected(payable); setAmount(String(payable.outstanding_balance)); }} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-xs font-black text-white hover:bg-emerald-500"><CheckCircle2 size={15}/>Registrar pagamento</button>}
      </article>;
    })}</div>}

    {selected && <div className="fixed inset-0 z-[2400] flex items-end justify-center bg-slate-950/85 p-0 backdrop-blur-sm sm:items-center sm:p-4"><form onSubmit={async event => { event.preventDefault(); await onPay({ payableId: selected.id, accountId: accountId || null, amount: Number(amount), receipt }); close(); }} className="w-full max-w-md rounded-t-3xl border border-slate-700 bg-slate-900 p-5 sm:rounded-3xl"><div className="flex items-center justify-between"><div><span className="text-[9px] font-black uppercase text-emerald-400">Pagamento</span><h3 className="text-base font-black text-white">{selected.creditor_name}</h3></div><button type="button" onClick={close} className="rounded-full bg-slate-800 p-2 text-slate-300"><X size={17}/></button></div><p className="mt-2 text-xs text-slate-400">Saldo devedor: <strong className="text-rose-300">{formatMoney(selected.outstanding_balance)}</strong></p><div className="mt-4 space-y-3"><label className="block text-xs text-slate-300">Valor pago<input required type="number" min="0.01" max={selected.outstanding_balance} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/></label><label className="block text-xs text-slate-300">Debitar da conta<select value={accountId} onChange={e => setAccountId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"><option value="">Pagamento externo/manual</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.nickname} · {formatMoney(account.balance)}</option>)}</select></label><label className="block text-xs text-slate-300">Comprovante (opcional)<span className="mt-1 flex items-center gap-2 rounded-xl border border-dashed border-slate-700 p-3"><FileUp size={17}/><span className="min-w-0 flex-1 truncate">{receipt?.name || 'PDF ou imagem, até 10 MB'}</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={e => setReceipt(e.target.files?.[0] || null)}/></span></label><button type="submit" disabled={saving} className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-black text-white disabled:opacity-50">{saving ? 'Registrando...' : 'Confirmar pagamento'}</button></div></form></div>}
  </div>;
};
