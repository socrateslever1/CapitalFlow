import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowLeftRight, CheckCircle2, Copy, QrCode, ImagePlus, Landmark, Pencil, Save, X } from 'lucide-react';
import {
  PersonalWalletAccount,
  PersonalWalletExpense,
  PersonalWalletExpenseInstallment,
  PersonalWalletInvoicePayment,
  PersonalWalletCard,
  WalletAccountOperation,
  WalletStatementRow,
  personalWalletService,
} from '../../services/personalWallet.service';
import type { CapitalSource } from '../../types';
import { formatMoney } from '../../utils/formatters';
import { AccountActivityPanel } from './AccountActivityPanel';
import { WalletPixCharge } from './WalletPixCharge';
import { BankLogo } from './BankLogo';
import { BANK_CATALOG } from '../../utils/bankLogoRegistry';
import { pixKeyTypeLabel } from './walletPresentation';
import { AccountMovementModal } from './AccountMovementModal';

type Props = {
  account: PersonalWalletAccount;
  expenses: PersonalWalletExpense[];
  installments: PersonalWalletExpenseInstallment[];
  cards: PersonalWalletCard[];
  invoicePayments: PersonalWalletInvoicePayment[];
  accounts: PersonalWalletAccount[];
  accountOperations: WalletAccountOperation[];
  statementRows: WalletStatementRow[];
  onBack: () => void;
  onSaved: () => Promise<void>;
  ownerName?: string;
  ownerCity?: string;
  capitalSources: CapitalSource[];
};

const typeLabels: Record<string, string> = {
  CHECKING: 'Conta corrente',
  SAVINGS: 'Poupança',
  CASH: 'Carteira física',
  INVESTMENT: 'Investimento',
};
const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500';
const labelClass = 'block space-y-1 text-xs font-semibold text-slate-300';

export const AccountDetailsPage: React.FC<Props> = ({ account, accounts, cards, expenses, installments, invoicePayments, accountOperations, statementRows, onBack, onSaved, ownerName, ownerCity, capitalSources }) => {
  const [editing, setEditing] = useState(false);
  const [pixChargeOpen, setPixChargeOpen] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);
  const [movementOpen, setMovementOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [form, setForm] = useState({
    nickname: account.nickname,
    bank_name: account.bank_name || '',
    account_type: account.account_type,
    pix_key_type: account.pix_key_type || '',
    pix_key: account.pix_key || '',
    notes: account.notes || '',
    capital_source_id: account.capital_source_id || '',
  });

  useEffect(() => () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  const reset = () => {
    setForm({
      nickname: account.nickname,
      bank_name: account.bank_name || '',
      account_type: account.account_type,
      pix_key_type: account.pix_key_type || '',
      pix_key: account.pix_key || '',
      notes: account.notes || '',
      capital_source_id: account.capital_source_id || '',
    });
    setImage(null);
    setImagePreview('');
    setError('');
    setEditing(false);
  };

  const update = (field: keyof typeof form, value: string) => setForm(current => ({ ...current, [field]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await personalWalletService.updateAccount(account.id, {
        nickname: form.nickname,
        bank_name: form.bank_name || null,
        account_type: form.account_type,
        pix_key_type: form.pix_key_type || null,
        pix_key: form.pix_key || null,
        notes: form.notes || null,
        capital_source_id: form.capital_source_id || null,
      }, image);
      setImage(null);
      setImagePreview('');
      await onSaved();
      setEditing(false);
      setSuccess('Dados da conta atualizados. O saldo permaneceu inalterado.');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível atualizar a conta.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-auto max-w-4xl space-y-4 pb-32 sm:pb-16 animate-in fade-in">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-800">
          <ArrowLeft size={16} /> Voltar às contas
        </button>
        {!editing && <div className="flex gap-2">
          <button type="button" onClick={() => setMovementOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-emerald-500">
            <ArrowLeftRight size={15}/> Movimentar
          </button>
          <button type="button" onClick={() => { setEditing(true); setError(''); setSuccess(''); }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-800">
            <Pencil size={15} /> Editar conta
          </button>
        </div>}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3 sm:p-4">
        <div className="flex items-center gap-3">
          <BankLogo name={account.bank_name} alternateName={account.nickname} customImage={account.image_url} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-400">{account.account_type === 'CASH' ? 'Carteira física' : 'Conta bancária'}</p>
            <h1 className="truncate text-lg font-bold text-white">{account.nickname}</h1>
            <p className="truncate text-xs text-slate-400">{account.bank_name || (account.account_type === 'CASH' ? 'Dinheiro em espécie' : 'Banco não informado')} · {typeLabels[account.account_type] || account.account_type}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Saldo</p>
            <p className="whitespace-nowrap text-lg font-extrabold text-emerald-400">{formatMoney(Number(account.balance))}</p>
          </div>
        </div>
        {!editing && <div className="mt-3 flex flex-col gap-2 border-t border-slate-800 pt-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-[10px] font-bold text-slate-400">PIX {pixKeyTypeLabel(account.pix_key_type)}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-slate-200">{account.pix_key || 'Chave não cadastrada'}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={!account.pix_key} onClick={async()=>{
              try {await navigator.clipboard.writeText(account.pix_key || '');setPixCopied(true);setError('');}
              catch {setError('Não foi possível copiar a chave PIX neste navegador.');}
            }} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs font-semibold text-slate-200 disabled:opacity-40">
              {pixCopied?<CheckCircle2 size={15}/>:<Copy size={15}/>} {pixCopied?'PIX copiado':'Copiar PIX'}
            </button>
            <button type="button" disabled={!account.pix_key} onClick={()=>setPixChargeOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-40">
              <QrCode size={16}/> Gerar cobrança
            </button>
          </div>
          {account.notes && <p className="truncate text-[11px] text-slate-500" title={account.notes}>{account.notes}</p>}
        </div>}
      </div>
      {pixChargeOpen && account.pix_key && <WalletPixCharge accounts={accounts} initialAccountId={account.id} recipient={ownerName || account.nickname} city={ownerCity} onClose={()=>setPixChargeOpen(false)} onSaved={onSaved} />}
      {movementOpen && <AccountMovementModal accounts={accounts} cards={cards} expenses={expenses} installments={installments}
        initialAccountId={account.id} onClose={()=>setMovementOpen(false)} onSaved={onSaved}/>}

      {success && <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-800 bg-emerald-950/30 p-3 text-xs text-emerald-200"><CheckCircle2 size={16} />{success}</div>}
      {error && <div role="alert" className="rounded-lg border border-rose-700 bg-rose-950/30 p-3 text-xs text-rose-200">{error}</div>}

      {editing && (
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6">
          <h2 className="text-sm font-bold text-white">Editar dados da conta</h2>
          <datalist id="account-bank-catalog">{BANK_CATALOG.map(bank => <option key={bank.id} value={bank.name}/>)}</datalist>
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 p-2 text-xs text-slate-400">
            <BankLogo name={form.bank_name} alternateName={form.nickname} size="sm"/>
            Logo local automático quando disponível; a imagem personalizada tem prioridade.
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>Apelido
              <input required maxLength={120} className={inputClass} value={form.nickname} onChange={e => update('nickname', e.target.value)} />
            </label>
            <label className={labelClass}>Banco
              <input list="account-bank-catalog" maxLength={120} className={inputClass} value={form.bank_name} onChange={e => update('bank_name', e.target.value)} />
            </label>
            <label className={labelClass}>Tipo de conta
              <select className={inputClass} value={form.account_type} onChange={e => update('account_type', e.target.value)}>
                <option value="CHECKING">Conta corrente</option>
                <option value="SAVINGS">Poupança</option>
                <option value="CASH">Carteira física</option>
                <option value="INVESTMENT">Investimento</option>
              </select>
            </label>
            <label className={labelClass}>Tipo da chave PIX
              <select className={inputClass} value={form.pix_key_type} onChange={e => {
                update('pix_key_type', e.target.value);
              }}>
                <option value="">Sem PIX</option>
                <option value="CPF">CPF</option>
                <option value="EMAIL">E-mail</option>
                <option value="PHONE">Telefone</option>
                <option value="RANDOM">Aleatória</option>
              </select>
            </label>
            <label className={labelClass}>Chave PIX
              <input className={inputClass} maxLength={255} value={form.pix_key} onChange={e => update('pix_key', e.target.value)} />
            </label>
            <label className={labelClass}>Logotipo ou imagem
              <span className="flex items-center gap-2 rounded-lg border border-dashed border-slate-700 p-2">
                <ImagePlus size={18} className="text-slate-400" />
                <span className="truncate text-xs text-slate-400">{image?.name || 'Escolher imagem (JPEG/PNG/WebP)'}</span>
                <input className="max-w-[5rem] text-xs" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => {
                  const file = e.target.files?.[0] || null;
                  setImage(file);
                  setImagePreview(file ? URL.createObjectURL(file) : '');
                }} />
              </span>
              {imagePreview && <img src={imagePreview} alt="Prévia da nova imagem" className="mt-2 h-14 w-14 rounded-lg object-cover" />}
            </label>
            <label className={`${labelClass} sm:col-span-2`}>Observações
              <textarea className={inputClass} rows={3} maxLength={2000} value={form.notes} onChange={e => update('notes', e.target.value)} />
            </label>
            <label className={`${labelClass} sm:col-span-2`}>Fonte de capital vinculada (opcional)
              <select className={inputClass} value={form.capital_source_id} onChange={e => update('capital_source_id', e.target.value)}>
                <option value="">Nenhuma — manter fluxo legado</option>
                {capitalSources.map(source => <option key={source.id} value={source.id}>{source.name} · {formatMoney(Number(source.balance || 0))}</option>)}
              </select>
              <span className="text-[11px] font-normal text-slate-500">Empréstimos e parcelas só afetam esta conta quando a integração estiver autorizada.</span>
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" disabled={saving} onClick={reset} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2.5 text-xs text-slate-200"><X size={14} /> Cancelar</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"><Save size={14} />{saving ? 'Salvando...' : 'Salvar alterações'}</button>
          </div>
        </form>
      )}

      <AccountActivityPanel account={account} accounts={accounts}
        operations={accountOperations} statementRows={statementRows}
        expenses={expenses} invoicePayments={invoicePayments} onSaved={onSaved} />
    </section>
  );
};
