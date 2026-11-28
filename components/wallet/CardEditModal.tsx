import React,{useState} from 'react';
import {Archive,CreditCard,LockKeyhole,Save,Trash2} from 'lucide-react';
import {PersonalWalletCard,PersonalWalletAccount,personalWalletService} from '../../services/personalWallet.service';
import {BANK_CATALOG} from '../../utils/bankLogoRegistry';
import {formatMoney} from '../../utils/formatters';
import {getBankVisual} from './walletPresentation';
import { parseWalletMoney } from '../../features/wallet/utils/parseWalletMoney';
import {Modal,modalPrimaryActionClass} from '../ui/Modal';
import {CardVaultModal} from './CardVaultModal';
import {FinancialCalculatorInput} from '../forms/FinancialCalculatorInput';
import {SelectOptionList} from '../ui/SelectOptionList';
import {notifyFinancialDataChanged} from '../../utils/appSyncEvents';
type Props={card:PersonalWalletCard;accounts:PersonalWalletAccount[];onClose:()=>void;onSaved:()=>Promise<void>};
const field='mt-1 min-h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white';
export const CardEditModal:React.FC<Props>=({card,accounts,onClose,onSaved})=>{
 const [form,setForm]=useState({nickname:card.nickname,issuer:card.issuer||'',brand:card.brand||'',account_id:card.account_id||'',last_four:card.last_four||'',cardholder_name:card.cardholder_name||'',expiry_month:card.expiry_month?String(card.expiry_month):'',expiry_year:card.expiry_year?String(card.expiry_year):'',credit_limit:String(card.credit_limit),closing_day:String(card.closing_day||''),due_day:String(card.due_day||''),closing_mode:card.closing_mode==='DAYS_BEFORE_DUE'?'DAYS_BEFORE_DUE':'FIXED_DAY',closing_days_before_due:String(card.closing_days_before_due||''),due_business_days:card.due_business_days?'yes':'no',push_reminders:card.push_reminders===false?'no':'yes',status:card.status,primary_color:card.primary_color||getBankVisual(card.issuer||card.nickname).accent});
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
  if (Math.round(limit * 100) < Math.round(Number(card.used_limit) * 100) && limit < Number(card.credit_limit)) { setError('Não reduza o limite enquanto o cartão está excedido.'); return; }
  const dynamicClosing=form.closing_mode==='DAYS_BEFORE_DUE';
  const daysBefore=Number(form.closing_days_before_due);
  if(dynamicClosing&&(!Number.isInteger(daysBefore)||daysBefore<1||daysBefore>20)){setError('Informe de 1 a 20 dias antes do vencimento.');return;}
  if(dynamicClosing&&!form.due_day){setError('Informe o dia de vencimento.');return;}
  const rulesChanged=form.closing_mode!==(card.closing_mode||'FIXED_DAY')
   ||(dynamicClosing&&daysBefore!==Number(card.closing_days_before_due||0))
   ||(form.due_business_days==='yes')!==Boolean(card.due_business_days);
  setSaving(true);setError('');
  try{
   await personalWalletService.updateCardMetadata(card.id,{
    nickname:form.nickname.trim()||form.issuer.trim()||card.nickname,issuer:form.issuer,brand:form.brand,account_id:form.account_id||null,
    last_four:form.last_four||null,cardholder_name:form.cardholder_name.trim()||null,
    expiry_month:form.expiry_month?Number(form.expiry_month):null,expiry_year:form.expiry_year?Number(form.expiry_year):null,
    credit_limit:limit,closing_day:form.closing_day?Number(form.closing_day):null,
    due_day:form.due_day?Number(form.due_day):null,status:form.status as 'ACTIVE'|'BLOCKED'|'CANCELED',primary_color:form.primary_color
   });
   // Regra do ciclo: vale do mês atual em diante; faturas anteriores mantêm a regra antiga.
   if(rulesChanged&&form.due_day){
    await personalWalletService.setCardCycleRules(card.id,{
     closingMode:dynamicClosing?'DAYS_BEFORE_DUE':'FIXED_DAY',
     closingDay:form.closing_day?Number(form.closing_day):null,
     closingDaysBeforeDue:dynamicClosing?daysBefore:null,
     dueDay:Number(form.due_day),dueBusinessDays:form.due_business_days==='yes',
    });
   }
   // Aviso de fatura no celular: liga ou desliga só este cartão.
   if((form.push_reminders==='yes')!==(card.push_reminders!==false)){
    await personalWalletService.setCardPushReminders(card.id,form.push_reminders==='yes');
   }
   notifyFinancialDataChanged({wallet:true,sourceOrigins:true});await onSaved();onClose();
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
    <div className="space-y-1 text-xs text-slate-300">
     <span className="block">Bandeira</span>
     <SelectOptionList
      ariaLabel="Bandeira"
      value={form.brand}
      placeholder="Não informada"
      clearable
      options={['Mastercard','Visa','Elo','American Express','Hipercard'].map(name=>({value:name,label:name}))}
      onChange={value=>change('brand',value)}
     />
    </div>
    <div className="space-y-1 text-xs text-slate-300">
     <span className="block">Conta vinculada</span>
     <SelectOptionList
      ariaLabel="Conta vinculada"
      value={form.account_id}
      placeholder="Avulso — apenas crédito"
      clearable
      options={accounts.map(a=>({value:a.id,label:`Híbrido · ${a.nickname}`}))}
      onChange={value=>change('account_id',value)}
     />
    </div>
    <label className="text-xs text-slate-300">Nome impresso no cartão<input maxLength={120} autoComplete="cc-name" className={field} value={form.cardholder_name} onChange={e=>change('cardholder_name',e.target.value)} placeholder="NOME DO TITULAR"/></label>
    <div className="grid grid-cols-2 items-end gap-2 self-start">
     <label className="flex flex-col justify-between text-xs text-slate-300">Mês da validade<input type="number" min="1" max="12" autoComplete="cc-exp-month" className={field} value={form.expiry_month} onChange={e=>change('expiry_month',e.target.value)} placeholder="MM"/></label>
     <label className="flex flex-col justify-between text-xs text-slate-300">Ano da validade<input type="number" min="2000" max="2200" autoComplete="cc-exp-year" className={field} value={form.expiry_year} onChange={e=>change('expiry_year',e.target.value)} placeholder="AAAA"/></label>
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
    <label className="text-xs text-slate-300">Limite total<FinancialCalculatorInput required className={field} value={form.credit_limit} onCommit={value=>change('credit_limit',value)} fieldLabel="limite de crédito"/><span className="mt-1 block text-[11px] text-slate-400">Disponível atual: <strong className="text-emerald-300">{formatMoney(Math.max(0,(() => { try { return parseWalletMoney(form.credit_limit); } catch { return 0; } })()-Number(card.used_limit)))}</strong></span></label>
    <div className="grid grid-cols-2 items-start gap-2">
     <label className="col-span-2 min-w-0 text-xs text-slate-300"><span className="block truncate">Como a fatura fecha</span>
      <select className={field} value={form.closing_mode} onChange={e=>change('closing_mode',e.target.value)}>
       <option value="FIXED_DAY">Em um dia fixo do mês</option>
       <option value="DAYS_BEFORE_DUE">Alguns dias antes do vencimento</option>
      </select></label>
     {form.closing_mode==='DAYS_BEFORE_DUE'
      ?<label className="min-w-0 text-xs text-slate-300"><span className="block truncate">Dias antes do vencimento</span><input type="number" min="1" max="20" className={field} value={form.closing_days_before_due} onChange={e=>change('closing_days_before_due',e.target.value)}/></label>
      :<label className="min-w-0 text-xs text-slate-300"><span className="block truncate">Fechamento (dia)</span><input type="number" min="1" max="31" className={field} value={form.closing_day} onChange={e=>change('closing_day',e.target.value)}/></label>}
     <label className="min-w-0 text-xs text-slate-300"><span className="block truncate">Vencimento (dia)</span><input type="number" min="1" max="31" className={field} value={form.due_day} onChange={e=>change('due_day',e.target.value)}/></label>
     <label className="col-span-2 flex min-h-11 items-center gap-2 text-xs text-slate-300"><input type="checkbox" className="h-4 w-4 accent-blue-500" checked={form.due_business_days==='yes'} onChange={e=>change('due_business_days',e.target.checked?'yes':'no')}/>Vencimento em fim de semana ou feriado nacional passa para o próximo dia útil</label>
     <label className="col-span-2 flex min-h-11 items-center gap-2 text-xs text-slate-300"><input type="checkbox" className="h-4 w-4 accent-blue-500" checked={form.push_reminders==='yes'} onChange={e=>change('push_reminders',e.target.checked?'yes':'no')}/>Avisar no celular antes de a fatura fechar ou vencer</label>
     {form.closing_mode==='DAYS_BEFORE_DUE'&&Number(form.closing_days_before_due)>0&&(Number(form.closing_days_before_due)<5||Number(form.closing_days_before_due)>15)&&<p className="col-span-2 text-[11px] text-amber-300">A maioria dos cartões fecha entre 7 e 10 dias antes do vencimento. Confira com a fatura do banco.</p>}
     <p className="col-span-2 text-[11px] text-slate-400">Mudanças em fechamento e vencimento valem a partir deste mês; faturas anteriores continuam como estavam. Feriados estaduais e municipais não são considerados.</p>
    </div>
    <fieldset className="space-y-2">
      <legend className="text-xs text-slate-300">Cor do cartão no app</legend>
      <div className="flex flex-wrap gap-1">
        {[
          ['Preto', '#171717'], ['Grafite', '#334155'], ['Prata', '#87939f'],
          ['Champanhe', '#a89473'], ['Dourado', '#b88628'], ['Laranja', '#c05c26'],
          ['Vermelho', '#b83238'], ['Rosa', '#be3276'], ['Rosé', '#ac717d'],
          ['Roxo', '#773ab0'], ['Azul', '#315d91'], ['Turquesa', '#137e89'],
        ].map(([label, color]) => {
          const selected = form.primary_color.toLowerCase() === color;
          return <button key={color} type="button" title={label} aria-label={label} aria-pressed={selected}
            onClick={() => change('primary_color', color)}
            className="grid size-11 place-items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400">
            <span aria-hidden="true" style={{ backgroundColor: color }}
              className={`size-7 rounded-md border border-white/20 ${selected ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-950' : ''}`} />
          </button>;
        })}
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-300">
        <input type="color" value={form.primary_color} onChange={e=>change('primary_color',e.target.value)} className="size-11 cursor-pointer rounded-lg border border-slate-700 bg-slate-950 p-1"/>
        Cor personalizada
      </label>
    </fieldset>
    <div className="space-y-1 text-xs text-slate-300">
     <span className="block">Status</span>
     <SelectOptionList
      ariaLabel="Status"
      value={form.status}
      options={[{value:'ACTIVE',label:'Ativo'},{value:'BLOCKED',label:'Bloqueado neste sistema'}]}
      onChange={value=>change('status',value)}
     />
    </div>
    {error&&<p role="alert" className="text-xs text-rose-300 sm:col-span-2">{error}</p>}
   </div>
   <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-4 pt-4 text-xs">
    {archiveConfirm ? <><span className="text-amber-200">Arquivar este cartão e preservar o histórico?</span><span className="flex gap-2"><button type="button" disabled={saving} onClick={()=>setArchiveConfirm(false)} className="rounded-lg border border-slate-700 px-3 py-2 text-slate-200">Cancelar</button><button type="button" disabled={saving} onClick={()=>{void archive();}} className="rounded-lg bg-amber-600 px-3 py-2 font-bold text-white">{saving?'Arquivando...':'Arquivar'}</button></span></> : deleteConfirm ? <><span className="text-rose-200">Excluir este cartão definitivamente?</span><span className="flex gap-2"><button type="button" disabled={saving} onClick={()=>setDeleteConfirm(false)} className="rounded-lg border border-slate-700 px-3 py-2 text-slate-200">Cancelar</button><button type="button" disabled={saving} onClick={()=>{void remove();}} className="rounded-lg bg-rose-600 px-3 py-2 font-bold text-white">{saving?'Excluindo...':'Excluir'}</button></span></> : <span className="flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={()=>{setArchiveConfirm(true);setDeleteConfirm(false);}} className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 px-3 py-2 font-bold text-amber-200 hover:bg-amber-950/30"><Archive size={14}/> Arquivar cartão</button><button type="button" disabled={saving} onClick={()=>{setDeleteConfirm(true);setArchiveConfirm(false);}} className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 px-3 py-2 font-bold text-rose-300 hover:bg-rose-950/30"><Trash2 size={14}/> Excluir cartão</button></span>}
   </div>
  </form>
 </Modal>{vaultOpen&&<CardVaultModal card={{...card,last_four:form.last_four,has_protected_data:hasProtected}} onClose={()=>setVaultOpen(false)} onSaved={async lastFour=>{if(lastFour){change('last_four',lastFour);setHasProtected(true);}await onSaved();}}/>}</>;
};
