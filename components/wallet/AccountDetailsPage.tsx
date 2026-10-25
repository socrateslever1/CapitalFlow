import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, ImagePlus, Landmark, Pencil, ReceiptText, Save, X } from 'lucide-react';
import {
  PersonalWalletAccount,
  PersonalWalletExpense,
  PersonalWalletInvoicePayment,
  WalletAccountOperation,
  WalletStatementRow,
  personalWalletService,
} from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { AccountActivityPanel } from './AccountActivityPanel';

type Props = {
  account: PersonalWalletAccount;
  expenses: PersonalWalletExpense[];
  invoicePayments: PersonalWalletInvoicePayment[];
  accounts: PersonalWalletAccount[];
  accountOperations: WalletAccountOperation[];
  statementRows: WalletStatementRow[];
  onBack: () => void;
  onSaved: () => Promise<void>;
};

const typeLabels: Record<string, string> = {
  CHECKING: 'Conta corrente',
  SAVINGS: 'Poupança',
  CASH: 'Dinheiro',
  INVESTMENT: 'Investimento',
};
const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500';
const labelClass = 'block space-y-1 text-xs font-semibold text-slate-300';

export const AccountDetailsPage: React.FC<Props> = ({ account, accounts, expenses, invoicePayments, accountOperations, statementRows, onBack, onSaved }) => {
  const [editing, setEditing] = useState(false);
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
    });
    setImage(null);
    setImagePreview('');
    setError('');
    setEditing(false);
  };

  const movements = useMemo(() => [
    ...expenses.filter(expense => expense.account_id === account.id && expense.status === 'PAID').map(expense => ({
      id: `expense-${expense.id}`,
      date: expense.expense_date,
      label: expense.description,
      category: 'Despesa registrada',
      amount: -Number(expense.amount || 0),
    })),
    ...invoicePayments.filter(payment => payment.account_id === account.id && payment.source === 'ACCOUNT').map(payment => ({
      id: `invoice-${payment.id}`,
      date: payment.created_at,
      label: 'Pagamento de fatura',
      category: 'Cartão de crédito',
      amount: -Number(payment.amount || 0),
    })),
  ].sort((a, b) => b.date.localeCompare(a.date)), [account.id, expenses, invoicePayments]);

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
        {!editing && <button type="button" onClick={() => { setEditing(true); setError(''); setSuccess(''); }}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-500">
          <Pencil size={15} /> Editar conta
        </button>}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6">
        <div className="flex items-start gap-3">
          {account.image_url ? (
            <img src={account.image_url} alt={`Imagem da conta ${account.nickname}`} className="h-14 w-14 shrink-0 rounded-xl border border-slate-700 object-cover" />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <Landmark size={26} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-400">Conta bancária</p>
            <h1 className="break-words text-xl font-bold text-white">{account.nickname}</h1>
            <p className="text-sm text-slate-400">{account.bank_name || 'Banco não informado'} · {typeLabels[account.account_type] || account.account_type}</p>
          </div>
        </div>
        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Saldo registrado</p>
          <p className="mt-1 text-2xl font-black text-emerald-400">{formatMoney(Number(account.balance))}</p>
          <p className="mt-2 text-xs text-slate-500">O saldo não pode ser alterado pela edição dos dados cadastrais.</p>
        </div>
        {!editing && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
            <div><p className="text-xs text-slate-400">Tipo da chave PIX</p><p className="mt-1 break-words text-white">{account.pix_key_type || 'Não cadastrado'}</p></div>
            <div><p className="text-xs text-slate-400">Chave PIX</p><p className="mt-1 break-all text-white">{account.pix_key || 'Não cadastrada'}</p></div>
            <div className="sm:col-span-2"><p className="text-xs text-slate-400">Observações</p><p className="mt-1 whitespace-pre-wrap break-words text-white">{account.notes || 'Nenhuma observação.'}</p></div>
          </div>
        )}
      </div>

      {success && <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-800 bg-emerald-950/30 p-3 text-xs text-emerald-200"><CheckCircle2 size={16} />{success}</div>}
      {error && <div role="alert" className="rounded-lg border border-rose-700 bg-rose-950/30 p-3 text-xs text-rose-200">{error}</div>}

      {editing && (
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6">
          <h2 className="text-sm font-bold text-white">Editar dados da conta</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>Apelido
              <input required maxLength={120} className={inputClass} value={form.nickname} onChange={e => update('nickname', e.target.value)} />
            </label>
            <label className={labelClass}>Banco
              <input maxLength={120} className={inputClass} value={form.bank_name} onChange={e => update('bank_name', e.target.value)} />
            </label>
            <label className={labelClass}>Tipo de conta
              <select className={inputClass} value={form.account_type} onChange={e => update('account_type', e.target.value)}>
                <option value="CHECKING">Conta corrente</option>
                <option value="SAVINGS">Poupança</option>
                <option value="CASH">Dinheiro</option>
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
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" disabled={saving} onClick={reset} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2.5 text-xs text-slate-200"><X size={14} /> Cancelar</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"><Save size={14} />{saving ? 'Salvando...' : 'Salvar alterações'}</button>
          </div>
        </form>
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6">
        <h2 className="flex items-center gap-2 text-sm font-bold text-white"><ReceiptText size={18} className="text-emerald-400" /> Movimentações registradas</h2>
        <p className="mt-1 text-xs text-slate-400">Exibe despesas pagas e pagamentos de faturas feitos por esta conta. O saldo inicial não é uma movimentação individual.</p>
        {movements.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-slate-700 p-4 text-xs text-slate-400">Nenhuma movimentação registrada nesta conta.</p>
        ) : (
          <div className="mt-4 divide-y divide-slate-800">
            {movements.map(movement => (
              <div key={movement.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-white">{movement.label}</p>
                  <p className="text-[11px] text-slate-400">{movement.category} · {new Date(movement.date.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                </div>
                <strong className="shrink-0 text-sm text-rose-300">{formatMoney(movement.amount)}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
      <AccountActivityPanel account={account} accounts={accounts}
        operations={accountOperations} statementRows={statementRows} onSaved={onSaved} />
    </section>
  );
};
