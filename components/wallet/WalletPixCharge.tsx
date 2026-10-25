import React, { useMemo, useState } from 'react';
import { CheckCircle2, Copy, Link2, QrCode, Share2, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { PersonalWalletAccount } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { buildChargeLink } from './walletPresentation';
import { buildStaticPix } from './pixPayload';

type Props = {
  accounts: PersonalWalletAccount[];
  initialAccountId?: string;
  recipient: string;
  city?: string;
  onClose: () => void;
};

export const WalletPixCharge: React.FC<Props> = ({ accounts, initialAccountId, recipient, city, onClose }) => {
  const eligibleAccounts = useMemo(() => accounts.filter(account => Boolean(account.pix_key?.trim())), [accounts]);
  const [accountId, setAccountId] = useState(initialAccountId || eligibleAccounts[0]?.id || '');
  const [value, setValue] = useState('');
  const [description, setDescription] = useState('');
  const [payload, setPayload] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<'pix' | 'link' | ''>('');
  const selectedAccount = eligibleAccounts.find(account => account.id === accountId);

  const clearResult = () => { setPayload(''); setLink(''); setCopied(''); };
  const generate = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const raw = value.trim().replace(',', '.');
    const amount = Number(raw);
    try {
      if (!selectedAccount?.pix_key) throw new Error('Selecione uma conta com chave PIX cadastrada.');
      if (!/^\d+(\.\d{1,2})?$/.test(raw) || amount <= 0) throw new Error('Digite um valor válido, com até duas casas decimais.');
      if (!description.trim()) throw new Error('Informe uma descrição ou identificador para a cobrança.');
      const nextPayload = buildStaticPix({ key: selectedAccount.pix_key, recipient, city, amount, description });
      setPayload(nextPayload);
      setLink(buildChargeLink(`${window.location.origin}${window.location.pathname}`, { pixKey: selectedAccount.pix_key, recipient, amount, description }));
    } catch (reason) {
      setPayload(''); setLink('');
      setError(reason instanceof Error ? reason.message : 'Não foi possível gerar a cobrança.');
    }
  };
  const copy = async (text: string, kind: 'pix' | 'link') => {
    try { await navigator.clipboard.writeText(text); setCopied(kind); }
    catch { setError('Não foi possível copiar neste navegador.'); }
  };
  const share = async () => {
    if (navigator.share) await navigator.share({ title: 'Cobrança PIX', text: `${description} — ${formatMoney(Number(value.replace(',', '.')))}`, url: link });
    else await copy(link, 'link');
  };

  return <div role="dialog" aria-modal="true" aria-labelledby="pix-charge-title" className="fixed inset-0 z-[2200] flex items-end justify-center bg-slate-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
    <div className="max-h-[96dvh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] border border-slate-700/80 bg-slate-900 p-5 text-white shadow-2xl sm:rounded-[2rem]">
      <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-600 sm:hidden" />
      <div className="flex items-center justify-between"><h2 id="pix-charge-title" className="flex items-center gap-2 text-lg font-bold"><QrCode size={21} className="text-emerald-400" /> Gerar cobrança</h2><button type="button" aria-label="Fechar" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X size={19} /></button></div>
      <p className="mt-1 text-sm text-slate-400">O titular é preenchido automaticamente pelo seu perfil. Informe somente os dados da cobrança.</p>
      <form className="mt-5 space-y-4" onSubmit={generate}>
        <label className="block text-xs font-semibold text-slate-300">Conta de recebimento
          <select required value={accountId} onChange={event => { setAccountId(event.target.value); clearResult(); }} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white outline-none focus:border-emerald-500">
            <option value="">Selecione a conta</option>
            {eligibleAccounts.map(account => <option key={account.id} value={account.id}>{account.nickname} · {account.pix_key}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-300">Valor
          <input required inputMode="decimal" className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-lg font-bold text-white outline-none focus:border-emerald-500" value={value} onChange={event => { setValue(event.target.value); clearResult(); }} placeholder="R$ 0,00" />
        </label>
        <label className="block text-xs font-semibold text-slate-300">Descrição ou identificador
          <input required maxLength={72} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white outline-none focus:border-emerald-500" value={description} onChange={event => { setDescription(event.target.value); clearResult(); }} placeholder="Ex.: Consultoria outubro" />
        </label>
        <button disabled={!eligibleAccounts.length} type="submit" className="w-full rounded-xl bg-emerald-600 px-4 py-3.5 text-sm font-bold shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40">Gerar QR Code e link</button>
      </form>
      {!eligibleAccounts.length && <p role="alert" className="mt-3 text-xs text-amber-300">Cadastre uma chave PIX em uma conta para gerar cobranças.</p>}
      {error && <p role="alert" className="mt-3 text-xs text-rose-300">{error}</p>}
      {payload && <section aria-label="Cobrança gerada" className="mt-5 space-y-3 rounded-2xl border border-slate-700 bg-slate-950 p-4">
        <div className="mx-auto w-fit rounded-2xl bg-white p-3"><QRCodeSVG value={payload} size={224} level="Q" marginSize={1} /></div>
        <p className="text-center text-sm font-bold text-white">{formatMoney(Number(value.replace(',', '.')))}</p>
        <p className="text-center text-xs text-slate-400">{description}</p>
        <textarea readOnly aria-label="Código PIX Copia e Cola" rows={3} value={payload} className="w-full resize-none break-all rounded-lg border border-slate-700 bg-slate-900 p-2 text-[11px] text-slate-200" />
        <button type="button" onClick={() => copy(payload, 'pix')} className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-700 bg-emerald-800/30 p-3 text-sm font-bold text-emerald-200">{copied === 'pix' ? <CheckCircle2 size={17} /> : <Copy size={17} />}{copied === 'pix' ? 'Código PIX copiado' : 'Copiar Código PIX'}</button>
        <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => copy(link, 'link')} className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 p-3 text-xs font-bold"><Link2 size={16} />{copied === 'link' ? 'Link copiado' : 'Copiar link'}</button><button type="button" onClick={share} className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 p-3 text-xs font-bold"><Share2 size={16} />Compartilhar</button></div>
        <p className="text-center text-[10px] text-slate-500">PIX estático com CRC16. Confirme o recebimento no banco escolhido.</p>
      </section>}
    </div>
  </div>;
};
