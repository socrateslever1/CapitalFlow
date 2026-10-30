import React,{useState} from 'react';
import {AlertTriangle,Archive,CreditCard,LockKeyhole,Save,Trash2} from 'lucide-react';
import {PersonalWalletCard,PersonalWalletAccount,personalWalletService} from '../../services/personalWallet.service';
import {BANK_CATALOG} from '../../utils/bankLogoRegistry';
import {formatMoney} from '../../utils/formatters';
import {getBankVisual} from './walletPresentation';
import { parseWalletMoney } from '../../features/wallet/utils/parseWalletMoney';
import {Modal,modalPrimaryActionClass} from '../ui/Modal';
import {CardVaultModal} from './CardVaultModal';
type Props={card:PersonalWalletCard;accounts:PersonalWalletAccount[];onClose:()=>void;onSaved:()=>Promise<void>};
const field='mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white';
export const CardEditModal:React.FC<Props>=({card,accounts,onClose,onSaved})=>{
 const [form,setForm]=useState({nickname:card.nickname,issuer:card.issuer||'',brand:card.brand||'',account_id:card.account_id||'',last_four:card.last_four||'',cardholder_name:card.cardholder_name||'',expiry_month:card.expiry_month?String(card.expiry_month):'',expiry_year:card.expiry_year?String(card.expiry_year):'',credit_limit:String(card.credit_limit),closing_day:String(card.closing_day||''),due_day:String(card.due_day||''),status:card.status,primary_color:card.primary_color||getBankVisual(card.issuer||card.nickname).accent});
 const [saving,setSaving]=useState(false);
 const [deleteConfirm,setDeleteConfirm]=useState(false);
 const [archiveConfirm,setArchiveConfirm]=useState(false);
 const [error,setError]=useState('');
 const [vaultOpen,setVaultOpen]=useState(false);
 const [hasProtected,setHasProtected]=useState(Boolean(card.has_protected_data));
 const change=(key:keyof typeof form,value:string)=>setForm(previous=>({...previous,[key]:value}));
 const submit=async(event:React.FormEvent)=>{
  event.preventDefault();if(saving)return;
  if(form.last_four&&!/^\d{4}$/.test(form.last_four)){setError('Informe exatamente os quatro últimos dígitos.');return;}
  if(Boolean(form.expiry_month)!==Boolean(form.expiry_year)){setError('Informe mês e ano da validade juntos.');return;}
  let limit: number;
  try { limit = parseWalletMoney(form.credit_limit, 'limite de crédito'); }
  catch (reason) { setError(reason instanceof Error ? reason.message : 'Limite inválido.'); return; }
  if (Math.round(limit * 100) < Math.round(Number(card.used_limit) * 100)) { setError('O limite não pode ser menor que o valor utilizado.'); return; }
  setSaving(true);setError('');
  try{
   await personalWalletService.updateCardMetadata(card.id,{
    nickname:form.nickname.trim()||form.issuer.trim()||card.nickname,issuer:form.issuer,brand:form.brand,account_id:form.account_id||null,
    last_four:form.last_four||null,cardholder_name:form.cardholder_name.trim()||null,
    expiry_month:form.expiry_month?Number(form.expiry_month):null,expiry_year:form.expiry_year?Number(form.expiry_year):null,
    credit_limit:limit,closing_day:form.closing_day?Number(form.closing_day):null,
    due_day:form.due_day?Number(form.due_day):null,status:form.status as 'ACTIVE'|'BLOCKED'|'CANCELED',primary_color:form.primary_color
   });
   await onSaved();onClose();
 }catch(reason){setError(reason instanceof Error?reason.message:'Erro ao salvar');}
 finally{setSaving(false);}
 };
 const remove=async()=>{
  if(saving)return;
  setSaving(true);setError('');
  try{await personalWalletService.deleteCard(card.id);await onSaved();onClose();}
  catch(reason){setError(reason instanceof Error?reason.message:'Não foi possível excluir o cartão.');}
  finally{setSaving(false);setDeleteConfirm(false);}
 };
 const archive=async()=>{
  if(saving)return;
  setSaving(true);setError('');
  try{await personalWalletService.archiveCard(card.id);await onSaved();onClose();}
  catch(reason){setError(reason instanceof Error?reason.message:'Não foi possível arquivar o cartão.');}
  finally{setSaving(false);setArchiveConfirm(false);}
 };
 return <><Modal title="Editar cartão" subtitle={card.nickname} icon={<CreditCard size={18}/>} onClose={onClose} busy={saving}
  footer={<button type="submit" form="wallet-edit-card-form" disabled={saving} className={modalPrimaryActionClass}><Save size={15}/>{saving?'Salvando...':'Salvar alterações'}</button>}>
  <form id="wallet-edit-card-form" onSubmit={submit} className="space-y-4">
   <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <label className="text-xs text-slate-300">Instituição<input required maxLength={120} list="wallet-edit-banks" className={field} value={form.issuer} onChange={e=>change('issuer',e.target.value)}/><datalist id="wallet-edit-banks">{BANK_CATALOG.map(b=><option key={b.id} value={b.name}/>)}</datalist></label>
    <label className="text-xs text-slate-300">Apelido (opcional)<input maxLength={120} className={field} value={form.nickname} onChange={e=>change('nickname',e.target.value)} placeholder="Usa o nome da instituição se vazio"/></label>
    <label className="text-xs text-slate-300">Bandeira<select className={field} value={form.brand} onChange={e=>change('brand',e.target.value)}><option value="">Não informada</option>{['Mastercard','Visa','Elo','American Express','Hipercard'].map(name=><option key={name} value={name}>{name}</option>)}</select></label>
    <label className="text-xs text-slate-300">Conta vinculada<select className={field} value={form.account_id} onChange={e=>change('account_id',e.target.value)}><option value="">Avulso — apenas crédito</option>{accounts.map(a=><option key={a.id} value={a.id}>Híbrido · {a.nickname}</option>)}</select></label>
    <label className="text-xs text-slate-300">Nome impresso no cartão<input maxLength={120} autoComplete="cc-name" className={field} value={form.cardholder_name} onChange={e=>change('cardholder_name',e.target.value)} placeholder="NOME DO TITULAR"/></label>
    <div className="grid grid-cols-2 gap-2">
     <label className="text-xs text-slate-300">Mês da validade<input type="number" min="1" max="12" autoComplete="cc-exp-month" className={field} value={form.expiry_month} onChange={e=>change('expiry_month',e.target.value)} placeholder="MM"/></label>
     <label className="text-xs text-slate-300">Ano da validade<input type="number" min="2000" max="2200" autoComplete="cc-exp-year" className={field} value={form.expiry_year} onChange={e=>change('expiry_year',e.target.value)} placeholder="AAAA"/></label>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3 sm:col-span-2">
     <div className="space-y-1">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
       <span>Numeração do cartão</span>
       <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-[11px] text-slate-300">•••• {form.last_four || '----'}</span>
      </div>
      <p className="text-xs text-slate-400">Número e CVC são guardados criptografados, com senha própria, fora das listas e extratos. O final de 4 dígitos é atualizado automaticamente pelo número completo.</p>
     </div>
     <button type="button" onClick={()=>setVaultOpen(true)} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-200 hover:bg-blue-500/20"><LockKeyhole size={17}/>Número completo e código de segurança</button>
    </div>
    <label className="text-xs text-slate-300">Limite total<input type="text" inputMode="decimal" required className={field} value={form.credit_limit} onChange={e=>change('credit_limit',e.target.value)}/><span className="mt-1 block text-[11px] text-slate-400">Disponível atual: <strong className="text-emerald-300">{formatMoney(Math.max(0,(() => { try { return parseWalletMoney(form.credit_limit); } catch { return 0; } })()-Number(card.used_limit)))}</strong></span></label>
    <div className="grid grid-cols-2 gap-2">
     <label className="text-xs text-slate-300">Fechamento (dia)<input type="number" min="1" max="31" className={field} value={form.closing_day} onChange={e=>change('closing_day',e.target.value)}/></label>
     <label className="text-xs text-slate-300">Vencimento (dia)<input type="number" min="1" max="31" className={field} value={form.due_day} onChange={e=>change('due_day',e.target.value)}/></label>
    </div>
    <label className="text-xs text-slate-300">Cor no app<input type="color" value={form.primary_color} onChange={e=>change('primary_color',e.target.value)} className="mt-1 h-11 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-950 p-1"/></label>
    <label className="text-xs text-slate-300">Status<select className={field} value={form.status} onChange={e=>change('status',e.target.value)}><option value="ACTIVE">Ativo</option><option value="BLOCKED">Bloqueado neste sistema</option></select></label>
    <p className="flex gap-2 rounded-xl border border-amber-700/40 bg-amber-950/20 p-3 text-xs text-amber-200 sm:col-span-2"><AlertTriangle size={17} className="shrink-0"/>Arquivar preserva o histórico e retira o cartão da carteira ativa. Excluir é permanente e só é permitido sem faturas, lançamentos ou limite utilizado. Bloquear no CapitalFlow não bloqueia o cartão no banco.</p>
    {error&&<p role="alert" className="text-xs text-rose-300 sm:col-span-2">{error}</p>}
   </div>
   <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-4 pt-4 text-xs">
    {archiveConfirm ? <><span className="text-amber-200">Arquivar este cartão e preservar o histórico?</span><span className="flex gap-2"><button type="button" disabled={saving} onClick={()=>setArchiveConfirm(false)} className="rounded-lg border border-slate-700 px-3 py-2 text-slate-200">Cancelar</button><button type="button" disabled={saving} onClick={()=>{void archive();}} className="rounded-lg bg-amber-600 px-3 py-2 font-bold text-white">{saving?'Arquivando...':'Arquivar'}</button></span></> : deleteConfirm ? <><span className="text-rose-200">Excluir este cartão definitivamente?</span><span className="flex gap-2"><button type="button" disabled={saving} onClick={()=>setDeleteConfirm(false)} className="rounded-lg border border-slate-700 px-3 py-2 text-slate-200">Cancelar</button><button type="button" disabled={saving} onClick={()=>{void remove();}} className="rounded-lg bg-rose-600 px-3 py-2 font-bold text-white">{saving?'Excluindo...':'Excluir'}</button></span></> : <span className="flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={()=>{setArchiveConfirm(true);setDeleteConfirm(false);}} className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 px-3 py-2 font-bold text-amber-200 hover:bg-amber-950/30"><Archive size={14}/> Arquivar cartão</button><button type="button" disabled={saving} onClick={()=>{setDeleteConfirm(true);setArchiveConfirm(false);}} className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 px-3 py-2 font-bold text-rose-300 hover:bg-rose-950/30"><Trash2 size={14}/> Excluir cartão</button></span>}
   </div>
  </form>
 </Modal>{vaultOpen&&<CardVaultModal card={{...card,last_four:form.last_four,has_protected_data:hasProtected}} onClose={()=>setVaultOpen(false)} onSaved={async lastFour=>{if(lastFour){change('last_four',lastFour);setHasProtected(true);}await onSaved();}}/>}</>;
};
