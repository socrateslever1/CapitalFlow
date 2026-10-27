import React, { useMemo, useState } from 'react';
import { CreditCard, Landmark, X } from 'lucide-react';
import { personalWalletService, PersonalWalletAccount, PersonalWalletCard } from '../../../services/personalWallet.service';
import { formatMoney } from '../../../utils/formatters';
import { generateUUID } from '../../../utils/generators';

type Props = { accounts: PersonalWalletAccount[]; cards: PersonalWalletCard[]; onClose: () => void; onSaved: () => Promise<void> };
const categories = ['Alimentação','Transporte','Moradia','Serviços','Compras','Saúde','Lazer','Outros'];
const today = () => new Date().toLocaleDateString('en-CA');
const moneyInput = (raw: string) => { const digits = raw.replace(/\D/g,''); return digits ? (Number(digits)/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) : ''; };
const moneyValue = (value: string) => Number(value.replace(/\./g,'').replace(',','.')) || 0;

export default function QuickExpenseModal({ accounts, cards, onClose, onSaved }: Props) {
  const [mode, setMode] = useState<'CARD'|'ACCOUNT'>('CARD');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(today());
  const [category, setCategory] = useState('Outros');
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [cardId, setCardId] = useState(cards[0]?.id || '');
  const [installments, setInstallments] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const value = moneyValue(amount);
  const selectedCard = cards.find(card => card.id === cardId);
  const preview = useMemo(() => value > 0 ? `${installments}x de ${formatMoney(value / installments)} a partir de ${new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(`${date}T12:00:00`))}` : '', [value, installments, date]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError('');
    if (!description.trim() || value <= 0) { setError('Informe descrição e um valor válido.'); return; }
    if (mode === 'ACCOUNT' && !accountId) { setError('Selecione a conta de débito.'); return; }
    if (mode === 'CARD' && !cardId) { setError('Selecione o cartão.'); return; }
    setSaving(true);
    try {
      if (mode === 'ACCOUNT') await personalWalletService.recordAccountOperation({ type:'EXPENSE', fromAccountId:accountId, toAccountId:null, amount:value, description:description.trim(), category, date, requestId:generateUUID() });
      else await personalWalletService.createExpense({ description:description.trim(), amount:value, category, expense_date:date, due_date:null, account_id:null, card_id:cardId, status:'PENDING', installment_count:installments, notes:null, request_id:generateUUID() });
      await onSaved(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível registrar o lançamento.'); } finally { setSaving(false); }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4" role="dialog" aria-modal="true">
    <form onSubmit={submit} className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl">
      <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold text-white">Lançamento rápido</h2><button type="button" onClick={onClose} aria-label="Fechar" className="text-slate-400 hover:text-white"><X size={20}/></button></div>
      <div className="mb-4 grid grid-cols-2 rounded-xl bg-slate-950 p-1"><button type="button" onClick={()=>setMode('CARD')} className={`rounded-lg px-3 py-2 text-sm ${mode==='CARD'?'bg-blue-600 text-white':'text-slate-400'}`}><CreditCard size={15} className="mr-2 inline"/>Cartão de crédito</button><button type="button" onClick={()=>setMode('ACCOUNT')} className={`rounded-lg px-3 py-2 text-sm ${mode==='ACCOUNT'?'bg-emerald-600 text-white':'text-slate-400'}`}><Landmark size={15} className="mr-2 inline"/>Conta bancária / PIX</button></div>
      <label className="mb-3 block text-sm text-slate-300">Valor (R$)<input value={amount} onChange={e=>setAmount(moneyInput(e.target.value))} inputMode="decimal" placeholder="0,00" className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-3xl font-bold text-white outline-none"/></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm text-slate-300">Descrição<input value={description} onChange={e=>setDescription(e.target.value)} maxLength={160} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white" placeholder="Ex.: Supermercado"/></label><label className="text-sm text-slate-300">Data<input type="date" value={date} onChange={e=>setDate(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"/></label></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm text-slate-300">Categoria<select value={category} onChange={e=>setCategory(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white">{categories.map(item=><option key={item}>{item}</option>)}</select></label>{mode==='ACCOUNT'?<label className="text-sm text-slate-300">Conta de débito<select value={accountId} onChange={e=>setAccountId(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white">{accounts.map(account=><option key={account.id} value={account.id}>{account.nickname} — {formatMoney(account.balance)}</option>)}</select></label>:<label className="text-sm text-slate-300">Cartão<select value={cardId} onChange={e=>setCardId(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white">{cards.map(card=><option key={card.id} value={card.id}>{card.nickname} — limite {formatMoney(card.available_limit ?? card.credit_limit)}</option>)}</select></label>}</div>
      {mode==='CARD' && <div className="mt-3"><label className="text-sm text-slate-300">Condição<select value={installments} onChange={e=>setInstallments(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"><option value={1}>À vista (1x)</option>{Array.from({length:47},(_,i)=><option key={i+2} value={i+2}>{i+2} parcelas</option>)}</select></label>{preview && <p className="mt-2 text-xs text-blue-300">{preview}{selectedCard ? ` · ${selectedCard.nickname}` : ''}</p>}</div>}
      {error && <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}<button disabled={saving} className="mt-5 w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-50">{saving?'Salvando…':'Registrar lançamento'}</button>
    </form>
  </div>;
}
