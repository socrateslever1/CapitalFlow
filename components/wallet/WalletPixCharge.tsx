import React, { useRef, useState } from 'react';
import { CheckCircle2, Copy, Landmark, Link2, Loader2, QrCode, Share2, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { PersonalWalletAccount, personalWalletService } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { pixKeyTypeLabel } from './walletPresentation';
import { generateUUID } from '../../utils/generators';
import { BankLogo } from './BankLogo';
import { buildPersistedPixCharge, PersistedWalletChargePreview } from './walletChargeDomain';

type Props = {
  accounts: PersonalWalletAccount[];
  initialAccountId?: string | null;
  recipient: string;
  city?: string;
  onClose: () => void;
  onSaved?: () => Promise<void>;
  embedded?: boolean;
};

const inputClass = 'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white outline-none focus:border-emerald-500';

export const WalletPixCharge: React.FC<Props> = ({
  accounts, initialAccountId, recipient, city, onClose, onSaved, embedded = false,
}) => {
  const eligibleAccounts = accounts.filter(account => account.pix_key?.trim());
  const initial = eligibleAccounts.some(account => account.id === initialAccountId)
    ? initialAccountId as string : eligibleAccounts[0]?.id || '';
  const [accountId, setAccountId] = useState(initial);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [preview, setPreview] = useState<PersistedWalletChargePreview | null>(null);
  const [generating, setGenerating] = useState(false);
  const [settling, setSettling] = useState(false);
  const [confirmingSettlement, setConfirmingSettlement] = useState(false);
  const [settled, setSettled] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<'pix'|'link'|''>('');
  const createRequest = useRef({ signature: '', id: generateUUID() });
  const settleRequest = useRef({ signature: '', id: generateUUID(), occurredAt: '' });
  const account = eligibleAccounts.find(item => item.id === accountId) || null;

  const clearPreview = () => {
    setPreview(null); setSettled(false); setConfirmingSettlement(false); setCopied(''); setError('');
  };
  const changeAccount = (value: string) => { setAccountId(value); clearPreview(); };
  const changeAmount = (value: string) => { setAmount(value); clearPreview(); };
  const changeDescription = (value: string) => { setDescription(value); clearPreview(); };

  const generate = async () => {
    if (generating || settling) return;
    const normalized = amount.trim();
    const value = Number(normalized.replace(',', '.'));
    if (!account) { setError('Selecione uma conta com chave PIX cadastrada.'); return; }
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(normalized) || !Number.isFinite(value) || value <= 0) {
      setError('Informe um valor positivo com até duas casas decimais.'); return;
    }
    if (!description.trim()) { setError('Informe a descrição ou o identificador da cobrança.'); return; }
    if (!recipient.trim()) { setError('Preencha o nome do recebedor no perfil autenticado.'); return; }
    const signature = [account.id, value.toFixed(2), description.trim()].join(':');
    if (createRequest.current.signature !== signature) createRequest.current = { signature, id: generateUUID() };
    setGenerating(true); setError(''); setCopied('');
    try {
      const chargeId = await personalWalletService.createWalletCharge({
        accountId: account.id,
        amount: value,
        description: description.trim(),
        requestId: createRequest.current.id,
      });
      setPreview(buildPersistedPixCharge({
        chargeId, account, recipient, city, amount: value,
        description: description.trim(), origin: window.location.origin,
      }));
      setConfirmingSettlement(false); setSettled(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar a cobrança PIX.');
    } finally {
      setGenerating(false);
    }
  };

  const copy = async (text: string, kind: 'pix'|'link') => {
    setError('');
    try { await navigator.clipboard.writeText(text); setCopied(kind); }
    catch { setError('Não foi possível copiar. Selecione o texto para copiar manualmente.'); }
  };
  const share = async () => {
    if (!preview) return;
    try {
      if (navigator.share) await navigator.share({ title: 'Cobrança PIX', text: `${description} · ${formatMoney(preview.amount)}`, url: preview.url });
      else await copy(preview.url, 'link');
    } catch { setError('Não foi possível compartilhar. Copie o link.'); }
  };

  const settle = async () => {
    if (!preview || settling || settled) return;
    if (!confirmingSettlement) { setConfirmingSettlement(true); setError(''); return; }
    const signature = [preview.chargeId, preview.accountId, preview.amount.toFixed(2)].join(':');
    if (settleRequest.current.signature !== signature) {
      settleRequest.current = { signature, id: generateUUID(), occurredAt: new Date().toISOString() };
    }
    setSettling(true); setError('');
    try {
      await personalWalletService.settleWalletCharge({
        chargeId: preview.chargeId,
        accountId: preview.accountId,
        amount: preview.amount,
        occurredAt: settleRequest.current.occurredAt,
        requestId: settleRequest.current.id,
      });
      setSettled(true); setConfirmingSettlement(false);
      createRequest.current = { signature: '', id: generateUUID() };
      try {
        if (onSaved) await onSaved();
        else window.dispatchEvent(new Event('capitalflow:wallet-updated'));
      } catch {
        setError('Recebimento confirmado, mas não foi possível atualizar os saldos na tela. Recarregue a Carteira.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível baixar a cobrança.');
    } finally {
      setSettling(false);
    }
  };

  return <div role={embedded ? 'region' : 'dialog'} aria-modal={embedded ? undefined : 'true'} aria-labelledby="wallet-pix-title"
    className={embedded ? 'mx-auto w-full max-w-7xl' : 'fixed inset-0 z-[2500] flex items-end justify-center bg-slate-950/85 sm:items-center sm:p-4'}>
    <section className={`${embedded ? 'rounded-3xl' : 'max-h-[96dvh] rounded-t-3xl sm:rounded-3xl'} w-full space-y-5 overflow-y-auto border border-slate-700 bg-slate-900 p-5 text-white shadow-2xl sm:p-6 lg:p-8`}>
      <header className="flex items-center justify-between gap-3">
        <div><h2 id="wallet-pix-title" className="flex items-center gap-2 text-lg font-bold"><QrCode size={19} className="text-emerald-300"/>Cobrança PIX</h2>
          <p className="mt-1 text-xs text-slate-400">Crie um PIX estático vinculado a uma conta da Carteira.</p></div>
        {!embedded && <button type="button" onClick={onClose} aria-label="Fechar"><X size={19}/></button>}
      </header>

      <div className="lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,.95fr)] lg:items-start lg:gap-6">
      <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-semibold text-slate-300">Conta bancária de destino</p>
        {eligibleAccounts.length ? <div className="grid gap-2 sm:grid-cols-2">
          {eligibleAccounts.map(item => <button key={item.id} type="button" disabled={generating || settling} onClick={() => changeAccount(item.id)}
            aria-pressed={accountId === item.id} className={`flex min-w-0 items-center gap-3 rounded-xl border p-3 text-left ${accountId === item.id ? 'border-emerald-400 bg-emerald-950/30' : 'border-slate-700 bg-slate-950 hover:border-slate-500'}`}>
            <BankLogo name={item.bank_name} alternateName={item.nickname} customImage={item.image_url} size="sm"/>
            <span className="min-w-0 flex-1"><strong className="block truncate text-xs text-white">{item.nickname}</strong><span className="block truncate text-[10px] text-slate-400">{item.bank_name || 'Instituição não informada'} · {formatMoney(Number(item.balance))}</span><span className="block truncate text-[10px] text-emerald-300">PIX {pixKeyTypeLabel(item.pix_key_type)}: {item.pix_key}</span></span>
          </button>)}
        </div> : <p role="alert" className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-3 text-xs text-amber-200">Cadastre uma chave PIX em uma conta para gerar cobranças.</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-300">Valor (R$)
          <input inputMode="decimal" value={amount} onChange={event => changeAmount(event.target.value)} className={`${inputClass} text-lg font-bold`} placeholder="0,00"/>
        </label>
        <label className="text-xs text-slate-300">Descrição / identificador
          <input value={description} maxLength={240} onChange={event => changeDescription(event.target.value)} className={inputClass} placeholder="Referência da cobrança"/>
        </label>
      </div>
      <p className="text-xs text-slate-400">Recebedor: {recipient || 'Perfil sem nome'} · destino: {account?.nickname || 'nenhuma conta selecionada'}.</p>
      <button type="button" onClick={() => { void generate(); }} disabled={generating || settling || !account}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50">
        {generating ? <Loader2 size={17} className="animate-spin"/> : <QrCode size={17}/>} {generating ? 'Persistindo cobrança...' : preview ? 'Regerar cobrança persistida' : 'Gerar cobrança e QR Code'}
      </button>
      </div>

      {preview ? <div className="mt-5 space-y-3 rounded-2xl border border-slate-700 bg-slate-950 p-4 lg:mt-0 lg:p-5">
        <div className="mx-auto w-fit rounded-xl bg-white p-3"><QRCodeSVG value={preview.payload} size={220} marginSize={1} level="Q"/></div>
        <strong className="block text-center text-xl text-emerald-300">{formatMoney(preview.amount)}</strong>
        <p className="text-center text-[10px] text-slate-500">Cobrança {preview.chargeId.slice(0, 8).toUpperCase()} · vinculada a {account?.nickname}</p>
        <textarea readOnly aria-label="Código PIX Copia e Cola" rows={3} value={preview.payload} className="w-full resize-none break-all rounded-lg border border-slate-700 bg-slate-900 p-2 text-[11px] text-slate-200"/>
        <button type="button" onClick={() => { void copy(preview.payload, 'pix'); }} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 p-3 text-sm font-bold">
          {copied === 'pix' ? <CheckCircle2 size={16}/> : <Copy size={16}/>} {copied === 'pix' ? 'Código copiado' : 'Copiar Código PIX'}
        </button>
        <input aria-label="Link de pagamento" readOnly value={preview.url} className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-slate-300"/>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => { void copy(preview.url, 'link'); }} className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 p-3 text-xs font-bold"><Link2 size={15}/>{copied === 'link' ? 'Link copiado' : 'Copiar link'}</button>
          <button type="button" onClick={() => { void share(); }} className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 p-3 text-xs font-bold"><Share2 size={15}/>Compartilhar</button>
        </div>

        <div className={`rounded-xl border p-3 ${settled ? 'border-emerald-700/50 bg-emerald-950/20' : 'border-amber-700/50 bg-amber-950/20'}`}>
          {settled ? <p role="status" className="flex items-center gap-2 text-xs font-semibold text-emerald-200"><CheckCircle2 size={17}/>Cobrança baixada e saldo da conta atualizado.</p> : <>
            <p className="text-xs text-amber-200"><strong>Baixa manual:</strong> o CapitalFlow não consulta o banco. Confirme somente depois de conferir o crédito na instituição financeira.</p>
            {confirmingSettlement && <p role="alert" className="mt-2 text-xs font-bold text-amber-100">Confirma que {formatMoney(preview.amount)} já entrou em {account?.nickname}?</p>}
            <button type="button" onClick={() => { void settle(); }} disabled={settling}
              className={`mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold text-white disabled:opacity-50 ${confirmingSettlement ? 'bg-rose-600 hover:bg-rose-500' : 'bg-amber-600 hover:bg-amber-500'}`}>
              {settling ? <Loader2 size={16} className="animate-spin"/> : <Landmark size={16}/>} {settling ? 'Liquidando...' : confirmingSettlement ? 'Confirmar baixa definitiva' : 'Confirmar Recebimento Manual / Baixar Cobrança'}
            </button>
            {confirmingSettlement && <button type="button" onClick={() => setConfirmingSettlement(false)} className="mt-2 w-full py-2 text-xs text-slate-400">Cancelar confirmação</button>}
          </>}
        </div>
        <p className="text-[10px] text-slate-500">O link contém BR Code estático com CRC16. Não existe liquidação automática via Bacen ou Open Finance.</p>
      </div> : <p className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-8 text-center text-xs text-slate-400">Selecione a conta, informe valor e descrição e persista a cobrança para exibir o QR Code.</p>}
      </div>
      {error && <p role="alert" className="rounded-lg border border-rose-700/50 bg-rose-950/20 p-3 text-xs text-rose-300">{error}</p>}
    </section>
  </div>;
};
