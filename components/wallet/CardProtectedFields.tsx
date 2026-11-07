import React, { useState } from 'react';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';

export type CardProtectedDraft={number:string;securityCode:string;password:string;confirmation:string};
export const emptyProtectedCard=():CardProtectedDraft=>({number:'',securityCode:'',password:'',confirmation:''});
const input='mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white focus:border-blue-500 focus:outline-none';
export const CardProtectedFields: React.FC<{value:CardProtectedDraft;onChange:(value:CardProtectedDraft)=>void;askPassword?:boolean}> = ({value,onChange,askPassword=true}) => {
  const [visible,setVisible]=useState(false);
  const change=(key:keyof CardProtectedDraft,next:string)=>onChange({...value,[key]:next});
  const digits=value.number.replace(/\D/g,'');
  const derivedLastFour=digits.length>=4?digits.slice(-4):null;
  return <fieldset className="space-y-3 border-t border-slate-800 pt-4 sm:col-span-2">
    <div className="flex flex-wrap items-center justify-between gap-2 px-1">
      <legend className="flex items-center gap-2 text-sm font-semibold text-slate-200"><LockKeyhole size={16}/>Numeração e dados protegidos do cartão</legend>
      {derivedLastFour && <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">Final identificado: •••• {derivedLastFour}</span>}
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-medium text-slate-300">Número completo
        <input inputMode="numeric" autoComplete="off" name="wallet-vault-card-number" type={visible?'text':'password'} maxLength={23} className={input} value={value.number} onChange={event=>change('number',event.target.value.replace(/[^\d -]/g,''))} placeholder="12 a 19 dígitos (extrai o final automaticamente)"/>
      </label>
      <p className="self-center text-[11px] leading-relaxed text-slate-400">
        O código CVC/CVV não é solicitado nem armazenado pelo CapitalFlow.
      </p>
      {askPassword && <>
        <label className="text-xs font-medium text-slate-300">Senha para proteger este cartão<input type="password" autoComplete="new-password" minLength={12} maxLength={256} className={input} value={value.password} onChange={event=>change('password',event.target.value)} placeholder="Pelo menos 12 caracteres"/></label>
        <label className="text-xs font-medium text-slate-300">Confirmar senha<input type="password" autoComplete="new-password" maxLength={256} className={input} value={value.confirmation} onChange={event=>change('confirmation',event.target.value)} placeholder="Repita a senha do cofre"/></label>
      </>}
    </div>
    <button type="button" onClick={()=>setVisible(previous=>!previous)} className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-blue-300">{visible?<EyeOff size={16}/>:<Eye size={16}/>} {visible?'Ocultar número':'Mostrar número'}</button>
    {askPassword && <p className="text-xs leading-relaxed text-slate-400">Os 4 últimos dígitos são extraídos automaticamente do número completo. O número completo é protegido por criptografia; o CVC não é armazenado.</p>}
  </fieldset>;
};
