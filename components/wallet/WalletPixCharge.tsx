import React, { useState } from 'react';
import { Copy, CheckCircle2, QrCode, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

const emv = (id: string, value: string) => id + String(value.length).padStart(2, '0') + value;
function crc16(payload: string) {
  let crc = 0xffff;
  for (const char of new TextEncoder().encode(payload)) {
    crc ^= char << 8;
    for (let i=0;i<8;i++) crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    crc &= 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4,'0');
}
function ascii(value: string, limit: number) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 .-]/g, ' ').trim().toUpperCase().slice(0,limit);
}
export function buildStaticPix(key: string, recipient: string, city: string, amount?: number) {
  const cleanKey = key.trim();
  const name = ascii(recipient,25);
  const locality = ascii(city,15);
  if (!cleanKey || !name || !locality) throw new Error('Informe a chave PIX, o nome do recebedor e a cidade.');
  if (cleanKey.length > 77) throw new Error('Chave PIX inválida ou muito longa.');
  if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0 || amount > 99999999.99)) {
    throw new Error('Valor inválido.');
  }
  const merchantAccount = emv('00','BR.GOV.BCB.PIX')+emv('01',cleanKey);
  const txid = emv('05','***');
  const fields = emv('00','01')+emv('26',merchantAccount)+emv('52','0000')+emv('53','986')
    +(amount !== undefined ? emv('54',amount.toFixed(2)):'')
    +emv('58','BR')+emv('59',name)+emv('60',locality)+emv('62',txid);
  const check = fields+'6304';
  return check+crc16(check);
}
type Props = { pixKey: string; onClose: () => void };
export const WalletPixCharge: React.FC<Props> = ({pixKey,onClose}) => {
  const [recipient,setRecipient] = useState('');
  const [city,setCity] = useState('MANAUS');
  const [value,setValue] = useState('');
  const [payload,setPayload] = useState('');
  const [error,setError] = useState('');
  const [copied,setCopied] = useState(false);
  const generate = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');setCopied(false);
    const raw = value.trim().replace(',', '.');
    const amount = raw ? Number(raw) : undefined;
    try {
      if (raw && !/^\d+(\.\d{1,2})?$/.test(raw)) throw new Error('Digite um valor válido, com até duas casas decimais.');
      setPayload(buildStaticPix(pixKey,recipient,city,amount));
    } catch (reason: any) {setPayload('');setError(reason.message);}
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(payload);setCopied(true); }
    catch {setError('Não foi possível copiar. Selecione o código manualmente.');}
  };
  return <div role="dialog" aria-modal="true" className="fixed inset-0 z-[2200] flex items-center justify-center bg-slate-950/90 p-3">
    <div className="max-h-[94dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 text-white shadow-xl">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-bold"><QrCode size={20} className="text-emerald-400"/> Gerar cobrança PIX</h2>
        <button type="button" aria-label="Fechar" onClick={onClose}><X size={18}/></button>
      </div>
      <p className="mt-2 text-xs text-slate-400">Gera QR Code e Pix Copia e Cola estáticos para sua chave. Não envia cobrança ao banco nem confirma recebimento automaticamente.</p>
      <form className="mt-4 space-y-3" onSubmit={generate}>
        <label className="block text-xs text-slate-300">Nome do titular da chave PIX
          <input required maxLength={25} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-white" value={recipient} onChange={e=>{setRecipient(e.target.value);setPayload('');}} placeholder="Nome cadastrado no banco" />
        </label>
        <label className="block text-xs text-slate-300">Cidade
          <input required maxLength={15} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-white" value={city} onChange={e=>{setCity(e.target.value);setPayload('');}}/>
        </label>
        <label className="block text-xs text-slate-300">Valor (R$) — opcional
          <input inputMode="decimal" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-white" value={value} onChange={e=>{setValue(e.target.value);setPayload('');}} placeholder="0,00" />
        </label>
        <button type="submit" className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-bold">Gerar QR Code PIX</button>
      </form>
      {error && <p role="alert" className="mt-3 text-xs text-rose-300">{error}</p>}
      {payload && <div className="mt-4 space-y-3 rounded-xl border border-slate-700 bg-slate-950 p-4">
        <div className="mx-auto w-fit rounded-xl bg-white p-3"><QRCodeSVG value={payload} size={196} level="M" marginSize={0}/></div>
        <p className="text-center text-xs text-slate-400">Confira nome, chave e valor no aplicativo bancário antes de pagar.</p>
        <textarea readOnly aria-label="Código PIX Copia e Cola" rows={3} value={payload} className="w-full break-all rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-slate-200"/>
        <button type="button" onClick={copy} className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-700 bg-emerald-800/30 p-3 text-sm font-bold text-emerald-200">
          {copied?<CheckCircle2 size={17}/>:<Copy size={17}/>} {copied?'Copiado':'Copiar PIX Copia e Cola'}
        </button>
      </div>}
    </div>
  </div>;
};
