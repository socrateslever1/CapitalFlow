import React,{useMemo,useState} from 'react';
import {CheckCircle2,Copy,Link2,QrCode,Share2,X} from 'lucide-react';
import {QRCodeSVG} from 'qrcode.react';
import {PersonalWalletAccount} from '../../services/personalWallet.service';
import {buildStaticPix} from './pixPayload';
import {formatMoney} from '../../utils/formatters';
type Props={accounts:PersonalWalletAccount[];initialAccountId?:string;recipient:string;city?:string;onClose:()=>void;embedded?:boolean};
export const WalletPixCharge:React.FC<Props>=({accounts,initialAccountId,recipient,city,onClose,embedded=false})=>{
 const account=accounts.find(a=>a.id===initialAccountId&&a.pix_key)||accounts.find(a=>a.pix_key)||null;
 const [amount,setAmount]=useState('');
 const [description,setDescription]=useState('');
 const [error,setError]=useState('');
 const [copied,setCopied]=useState<'pix'|'link'|''>('');
 const generated=useMemo(()=>{
  const value=Number(amount.trim().replace(',','.'));
  const valid=/^\d+(?:[.,]\d{1,2})?$/.test(amount.trim());
  if(!account?.pix_key||!recipient.trim()||!valid||value<=0||!description.trim())return null;
  try{
   const payload=buildStaticPix({key:account.pix_key,recipient,city,amount:value,description});
   const url=new URL('/pix/cobrar',window.location.origin);
   url.searchParams.set('brcode',payload);
   url.searchParams.set('descricao',description.trim());
   return {payload,url:url.toString(),value};
  }catch{return null;}
 },[account?.pix_key,recipient,city,amount,description]);
 const copy=async(text:string,kind:'pix'|'link')=>{
  setError('');try{await navigator.clipboard.writeText(text);setCopied(kind);}
  catch{setError('Não foi possível copiar. Selecione o texto para copiar manualmente.');}
 };
 const share=async()=>{
  if(!generated)return;
  try{
   if(navigator.share)await navigator.share({title:'Cobrança PIX',text:description+' · '+formatMoney(generated.value),url:generated.url});
   else await copy(generated.url,'link');
  }catch{setError('Não foi possível compartilhar. Copie o link.');}
 };
 return <div role={embedded?'region':'dialog'} aria-modal={embedded?undefined:'true'} aria-labelledby="wallet-pix-title" className={embedded?'mx-auto w-full max-w-2xl':'fixed inset-0 z-[2500] flex items-end justify-center bg-slate-950/85 sm:items-center sm:p-4'}>
  <section className={`${embedded?'rounded-3xl':'max-h-[96dvh] rounded-t-3xl sm:rounded-3xl'} w-full space-y-4 overflow-y-auto border border-slate-700 bg-slate-900 p-5 text-white shadow-2xl`}>
   <header className="flex items-center justify-between"><h2 id="wallet-pix-title" className="flex items-center gap-2 text-lg font-bold"><QrCode size={19} className="text-emerald-300"/>Cobrança PIX</h2>{!embedded&&<button type="button" onClick={onClose} aria-label="Fechar"><X size={19}/></button>}</header>
   <p className="text-xs text-slate-400">Recebedor: {recipient||'Perfil sem nome'} · {account?.nickname||'Nenhuma chave PIX'}. Pix estático: confirme o crédito no banco.</p>
   <div className="grid gap-3 sm:grid-cols-2">
    <label className="text-xs text-slate-300">Valor (R$)<input inputMode="decimal" autoFocus value={amount} onChange={e=>{setAmount(e.target.value);setCopied('');}} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-lg font-bold text-white" placeholder="0,00"/></label>
    <label className="text-xs text-slate-300">Descrição / identificador<input value={description} maxLength={72} onChange={e=>{setDescription(e.target.value);setCopied('');}} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white" placeholder="Referência da cobrança"/></label>
   </div>
   {!account?.pix_key&&<p role="alert" className="text-xs text-amber-300">Cadastre uma chave PIX na sua conta para gerar cobranças.</p>}
   {!recipient.trim()&&<p role="alert" className="text-xs text-amber-300">Preencha o nome no perfil autenticado.</p>}
   {generated?<div className="space-y-3 rounded-2xl border border-slate-700 bg-slate-950 p-4">
    <div className="mx-auto w-fit rounded-xl bg-white p-3"><QRCodeSVG value={generated.payload} size={220} marginSize={1} level="Q"/></div>
    <strong className="block text-center text-xl text-emerald-300">{formatMoney(generated.value)}</strong>
    <textarea readOnly aria-label="Código PIX Copia e Cola" rows={3} value={generated.payload} className="w-full resize-none break-all rounded-lg border border-slate-700 bg-slate-900 p-2 text-[11px] text-slate-200"/>
    <button type="button" onClick={()=>copy(generated.payload,'pix')} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 p-3 text-sm font-bold">{copied==='pix'?<CheckCircle2 size={16}/>:<Copy size={16}/>} {copied==='pix'?'Código copiado':'Copiar Código PIX'}</button>
    <input aria-label="Link de pagamento" readOnly value={generated.url} className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-slate-300"/>
    <div className="grid grid-cols-2 gap-2"><button type="button" onClick={()=>copy(generated.url,'link')} className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 p-3 text-xs font-bold"><Link2 size={15}/>{copied==='link'?'Link copiado':'Copiar link'}</button><button type="button" onClick={share} className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 p-3 text-xs font-bold"><Share2 size={15}/>Compartilhar</button></div>
    <p className="text-[10px] text-slate-500">A página compartilhável contém o BR Code estático com CRC16. O CapitalFlow não recebe confirmação bancária automática.</p>
   </div>:<p className="rounded-xl border border-dashed border-slate-700 p-5 text-center text-xs text-slate-400">Digite valor e descrição para gerar o QR Code imediatamente.</p>}
   {error&&<p role="alert" className="text-xs text-rose-300">{error}</p>}
  </section>
 </div>;
};
