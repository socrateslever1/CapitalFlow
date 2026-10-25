import React, { useState } from 'react';
import { CheckCircle2, Copy, Link2, QrCode, Share2, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { buildChargeLink } from './walletPresentation';

const emv = (id: string, value: string) => id + String(value.length).padStart(2, '0') + value;
function crc16(payload: string) {
  let crc = 0xffff;
  for (const char of new TextEncoder().encode(payload)) {
    crc ^= char << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    crc &= 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
function ascii(value: string, limit: number) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 .-]/g, ' ').trim().toUpperCase().slice(0, limit);
}
export function buildStaticPix(key: string, recipient: string, city: string, amount?: number) {
  const cleanKey = key.trim();
  const name = ascii(recipient, 25);
  const locality = ascii(city || 'BRASILIA', 15);
  if (!cleanKey || !name) throw new Error('A conta precisa ter chave PIX e titular válidos.');
  if (cleanKey.length > 77) throw new Error('Chave PIX inválida ou muito longa.');
  if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0 || amount > 99999999.99)) throw new Error('Valor inválido.');
  const merchantAccount = emv('00', 'BR.GOV.BCB.PIX') + emv('01', cleanKey);
  const fields = emv('00', '01') + emv('26', merchantAccount) + emv('52', '0000') + emv('53', '986')
    + (amount !== undefined ? emv('54', amount.toFixed(2)) : '')
    + emv('58', 'BR') + emv('59', name) + emv('60', locality) + emv('62', emv('05', '***'));
  const check = fields + '6304';
  return check + crc16(check);
}

type Props = { pixKey: string; recipient: string; city?: string; onClose: () => void };
export const WalletPixCharge: React.FC<Props> = ({ pixKey, recipient, city = 'BRASILIA', onClose }) => {
  const [value, setValue] = useState('');
  const [payload, setPayload] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const generate = (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setCopied('');
    const raw = value.trim().replace(',', '.');
    const amount = raw ? Number(raw) : undefined;
    try {
      if (raw && !/^\d+(\.\d{1,2})?$/.test(raw)) throw new Error('Digite um valor válido, com até duas casas decimais.');
      setPayload(buildStaticPix(pixKey, recipient, city, amount));
      setLink(buildChargeLink(window.location.href.split('?')[0], { pixKey, recipient, amount }));
    } catch (reason: any) { setPayload(''); setLink(''); setError(reason.message); }
  };
  const copy = async (text: string, kind: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(kind); }
    catch { setError('Não foi possível copiar neste navegador.'); }
  };
  const share = async () => navigator.share
    ? navigator.share({ title: 'Cobrança PIX', text: `Cobrança de ${recipient}`, url: link })
    : copy(link, 'link');

  return <div role="dialog" aria-modal="true" className="fixed inset-0 z-[2200] flex items-center justify-center bg-slate-950/90 p-3">
    <div className="max-h-[94dvh] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-5 text-white shadow-2xl">
      <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-base font-bold"><QrCode size={20} className="text-emerald-400" /> Nova cobrança</h2><button type="button" aria-label="Fechar" onClick={onClose}><X size={18} /></button></div>
      <p className="mt-2 text-xs text-slate-400">Crie QR Code, Pix Copia e Cola e link compartilhável. O recebedor vem do seu perfil.</p>
      <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3"><span className="text-[9px] font-bold uppercase text-emerald-400">Recebedor</span><strong className="mt-1 block text-sm">{recipient}</strong><small className="text-slate-500">{pixKey}</small></div>
      <form className="mt-4 space-y-3" onSubmit={generate}>
        <label className="block text-xs text-slate-300">Valor da cobrança (opcional)<input inputMode="decimal" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-lg font-bold text-white" value={value} onChange={e => { setValue(e.target.value); setPayload(''); }} placeholder="R$ 0,00" /></label>
        <button type="submit" className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold">Gerar cobrança</button>
      </form>
      {error && <p role="alert" className="mt-3 text-xs text-rose-300">{error}</p>}
      {payload && <div className="mt-4 space-y-3 rounded-2xl border border-slate-700 bg-slate-950 p-4">
        <div className="mx-auto w-fit rounded-2xl bg-white p-3"><QRCodeSVG value={payload} size={196} level="M" marginSize={0} /></div>
        <textarea readOnly aria-label="Código PIX Copia e Cola" rows={3} value={payload} className="w-full break-all rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-slate-200" />
        <button type="button" onClick={() => copy(payload, 'pix')} className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-700 bg-emerald-800/30 p-3 text-sm font-bold text-emerald-200">{copied === 'pix' ? <CheckCircle2 size={17} /> : <Copy size={17} />}{copied === 'pix' ? 'PIX copiado' : 'Copiar Pix'}</button>
        <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => copy(link, 'link')} className="flex items-center justify-center gap-2 rounded-lg border border-slate-700 p-3 text-xs font-bold"><Link2 size={16} />{copied === 'link' ? 'Copiado' : 'Copiar link'}</button><button type="button" onClick={share} className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 p-3 text-xs font-bold"><Share2 size={16} />Compartilhar</button></div>
        <p className="text-center text-[10px] text-slate-500">Cobrança estática: confira os dados no banco. O CapitalFlow não confirma o recebimento automaticamente.</p>
      </div>}
    </div>
  </div>;
};
