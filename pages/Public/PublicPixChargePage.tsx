import React, { useMemo, useState } from 'react';
import { CheckCircle2, Copy, ShieldCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { isValidPixPayload } from '../../components/wallet/pixPayload';

const currency = (n: number) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);
function findEmv(payload: string, tag: string): string | null {
  let i=0;
  while(i+4<=payload.length) {
    const key=payload.slice(i,i+2), length=Number(payload.slice(i+2,i+4));
    if(!Number.isInteger(length)||length<0||i+4+length>payload.length)return null;
    if(key===tag)return payload.slice(i+4,i+4+length);
    i+=4+length;
  }
  return null;
}
export const PublicPixChargePage: React.FC = () => {
  const [copied,setCopied]=useState(false);
  const url=useMemo(()=>new URLSearchParams(window.location.search),[]);
  const payload=url.get('brcode')||'';
  const valid=payload.length<1000&&isValidPixPayload(payload);
  const amount=valid?Number(findEmv(payload,'54')||0):0;
  const description=String(url.get('descricao')||'').slice(0,72);
  const recipient=valid?findEmv(payload,'59')||'':'';
  const copy=async()=>{try{await navigator.clipboard.writeText(payload);setCopied(true);}catch{setCopied(false);}};
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-white">
    <section className="w-full max-w-md space-y-4 rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
      <div className="flex items-center gap-2 text-emerald-400"><ShieldCheck size={20}/><strong className="text-sm">CapitalFlow · Cobrança PIX</strong></div>
      {!valid
        ? <p role="alert" className="rounded-xl bg-rose-950/40 p-4 text-sm text-rose-200">Este link não contém um código PIX válido. Solicite outro ao recebedor.</p>
        : <>
          <h1 className="text-xl font-bold">Pagar com PIX</h1>
          <p className="text-sm text-slate-400">Recebedor informado: <strong className="text-white">{recipient}</strong></p>
          {amount>0&&<p className="text-3xl font-black text-emerald-400">{currency(amount)}</p>}
          {description&&<p className="break-words text-sm text-slate-300">{description}</p>}
          <div className="mx-auto w-fit rounded-2xl bg-white p-4"><QRCodeSVG value={payload} size={220} marginSize={1}/></div>
          <textarea readOnly aria-label="PIX Copia e Cola" value={payload} rows={3} className="w-full resize-none break-all rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs"/>
          <button type="button" onClick={copy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 p-3 font-bold">
            {copied?<CheckCircle2 size={17}/>:<Copy size={17}/>} {copied?'Copiado':'Copiar código PIX'}
          </button>
          <p className="text-xs text-slate-400">Confirme nome e valor no aplicativo do seu banco antes de pagar. O CapitalFlow não processa nem confirma este PIX automaticamente.</p>
        </>}
    </section>
  </main>;
};
