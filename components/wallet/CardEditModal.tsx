import React,{useState} from 'react';
import {AlertTriangle,Save,X} from 'lucide-react';
import {PersonalWalletCard,PersonalWalletAccount,personalWalletService} from '../../services/personalWallet.service';
import {BANK_CATALOG} from '../../utils/bankLogoRegistry';
import {formatMoney} from '../../utils/formatters';
type Props={card:PersonalWalletCard;accounts:PersonalWalletAccount[];onClose:()=>void;onSaved:()=>Promise<void>};
const field='mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white';
export const CardEditModal:React.FC<Props>=({card,accounts,onClose,onSaved})=>{
 const [form,setForm]=useState({nickname:card.nickname,issuer:card.issuer||'',brand:card.brand||'',account_id:card.account_id||'',credit_limit:String(card.credit_limit),closing_day:String(card.closing_day||''),due_day:String(card.due_day||''),status:card.status});
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const change=(key:keyof typeof form,value:string)=>setForm(previous=>({...previous,[key]:value}));
 const submit=async(event:React.FormEvent)=>{
  event.preventDefault();if(saving)return;
  setSaving(true);setError('');
  try{
   await personalWalletService.updateCardMetadata(card.id,{
    nickname:form.nickname,issuer:form.issuer,brand:form.brand,account_id:form.account_id||null,
    credit_limit:Number(form.credit_limit),closing_day:form.closing_day?Number(form.closing_day):null,
    due_day:form.due_day?Number(form.due_day):null,status:form.status as 'ACTIVE'|'BLOCKED'|'CANCELED'
   });
   await onSaved();onClose();
  }catch(reason){setError(reason instanceof Error?reason.message:'Erro ao salvar');}
  finally{setSaving(false);}
 };
 return <div role="dialog" aria-modal="true" aria-label="Editar cartão" className="fixed inset-0 z-[2500] flex items-end justify-center bg-slate-950/85 sm:items-center sm:p-4">
  <form onSubmit={submit} className="flex max-h-[94dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-700 bg-slate-900 sm:rounded-3xl">
   <header className="flex items-center justify-between border-b border-slate-800 p-4"><h2 className="text-lg font-bold text-white">Editar cartão</h2><button type="button" onClick={onClose} aria-label="Fechar" className="text-slate-300"><X size={19}/></button></header>
   <div className="grid min-h-0 grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2">
    <label className="text-xs text-slate-300">Apelido<input required maxLength={120} className={field} value={form.nickname} onChange={e=>change('nickname',e.target.value)}/></label>
    <label className="text-xs text-slate-300">Instituição<input required maxLength={120} list="wallet-edit-banks" className={field} value={form.issuer} onChange={e=>change('issuer',e.target.value)}/><datalist id="wallet-edit-banks">{BANK_CATALOG.map(b=><option key={b.id} value={b.name}/>)}</datalist></label>
    <label className="text-xs text-slate-300">Bandeira<select className={field} value={form.brand} onChange={e=>change('brand',e.target.value)}><option value="">Não informada</option>{['Mastercard','Visa','Elo','American Express','Hipercard'].map(name=><option key={name} value={name}>{name}</option>)}</select></label>
    <label className="text-xs text-slate-300">Tipo de cartão<select className={field} value={form.account_id} onChange={e=>change('account_id',e.target.value)}><option value="">Avulso — apenas crédito</option>{accounts.map(a=><option key={a.id} value={a.id}>Híbrido · {a.nickname}</option>)}</select></label>
    <label className="text-xs text-slate-300">Limite total<input type="number" required min={card.used_limit} step="0.01" className={field} value={form.credit_limit} onChange={e=>change('credit_limit',e.target.value)}/></label>
    <label className="text-xs text-slate-300">Limite disponível<input readOnly className={field+' opacity-70'} value={formatMoney(Math.max(0,Number(form.credit_limit)-Number(card.used_limit)))}/><span className="text-[10px] text-slate-500">Calculado a partir do uso real</span></label>
    <label className="text-xs text-slate-300">Fechamento (dia)<input type="number" min="1" max="31" className={field} value={form.closing_day} onChange={e=>change('closing_day',e.target.value)}/></label>
    <label className="text-xs text-slate-300">Vencimento (dia)<input type="number" min="1" max="31" className={field} value={form.due_day} onChange={e=>change('due_day',e.target.value)}/></label>
    <label className="text-xs text-slate-300 sm:col-span-2">Status<select className={field} value={form.status} onChange={e=>change('status',e.target.value)}><option value="ACTIVE">Ativo</option><option value="BLOCKED">Bloqueado neste sistema</option><option value="CANCELED">Arquivar cartão</option></select></label>
    <p className="flex gap-2 rounded-xl border border-amber-700/40 bg-amber-950/20 p-3 text-xs text-amber-200 sm:col-span-2"><AlertTriangle size={17} className="shrink-0"/>Arquivar exige saldo e faturas quitados. Bloqueio no CapitalFlow não bloqueia o cartão no banco; histórico financeiro não é apagado.</p>
    {error&&<p role="alert" className="text-xs text-rose-300 sm:col-span-2">{error}</p>}
   </div>
   <footer className="flex justify-end gap-2 border-t border-slate-800 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"><button type="button" disabled={saving} onClick={onClose} className="rounded-xl border border-slate-700 px-4 py-3 text-xs text-slate-200">Cancelar</button><button type="submit" disabled={saving} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-bold text-white disabled:opacity-50"><Save size={15}/>{saving?'Salvando...':'Salvar alterações'}</button></footer>
  </form>
 </div>;
};
