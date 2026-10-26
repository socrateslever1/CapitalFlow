import React, { useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import type { UserProfile } from '../../../types';
import { AccountCardStack } from '../../../components/wallet/AccountCardStack';
import { AccountDetailsPage } from '../../../components/wallet/AccountDetailsPage';
import { formatMoney } from '../../../utils/formatters';
import { personalWalletService } from '../../../services/personalWallet.service';
import { useWalletSnapshot } from '../hooks/useWalletSnapshot';
import { WalletPageFrame } from '../components/WalletPageFrame';
import { AccountMovementModal } from '../../../components/wallet/AccountMovementModal';

export const WalletAccountsPage: React.FC<{ activeUser?: UserProfile | null; onNavigate: (path: string) => void }> = ({ activeUser }) => {
  const { data, loading, error, refresh } = useWalletSnapshot();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [movementOpen, setMovementOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ nickname: '', bank_name: '', account_type: 'CHECKING', pix_key: '', pix_key_type: '' });
  const selected = data?.accounts.find(account => account.id === selectedId);
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setMessage('');
    try {
      await personalWalletService.createAccount({
        nickname: form.nickname.trim(), bank_name: form.bank_name.trim(),
        account_type: form.account_type, balance: 0,
        pix_key: form.pix_key.trim() || null,
        pix_key_type: form.pix_key.trim() ? form.pix_key_type || null : null,
      });
      await refresh();
      setCreating(false);
      setForm({ nickname: '', bank_name: '', account_type: 'CHECKING', pix_key: '', pix_key_type: '' });
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Falha ao cadastrar conta.'); }
    finally { setSaving(false); }
  };

  return <WalletPageFrame title="Contas e PIX" description="Seus saldos, contas e movimentações reais."
    error={error || message} loading={loading} onRefresh={() => { void refresh().catch(() => {}); }}>
    {data && (selected ? <AccountDetailsPage account={selected} accounts={data.accounts} cards={data.cards}
      expenses={data.expenses} installments={data.installments} invoicePayments={data.invoicePayments} accountOperations={data.accountOperations}
      statementRows={data.statementRows} onBack={() => setSelectedId(null)} onSaved={async () => { await refresh(); }}
      ownerName={activeUser?.fullName || activeUser?.name} ownerCity={activeUser?.city}/> : <>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900 p-4 lg:col-span-6">
          <AccountCardStack accounts={data.accounts} onOpen={account => setSelectedId(account.id)}/>
        </div>
        <div className="min-w-0 space-y-4 lg:col-span-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs font-semibold text-slate-400">Liquidez em contas</p>
            <strong className="mt-2 block text-2xl font-black text-emerald-300">
              {formatMoney(data.accounts.reduce((total, account) => total + Number(account.balance || 0), 0))}
            </strong>
            <p className="mt-2 text-xs text-slate-500">{data.accounts.length} conta(s) registrada(s)</p>
          </div>
          <button type="button" onClick={() => setCreating(value => !value)}
            className="w-full rounded-xl border border-emerald-600/40 bg-emerald-950/30 px-4 py-3 text-sm font-bold text-emerald-300">
            {creating ? 'Cancelar cadastro' : 'Adicionar conta bancária'}
          </button>
          <button type="button" onClick={() => setMovementOpen(true)} disabled={!data.accounts.length}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-40">
            <ArrowLeftRight size={18}/> Transferir / Movimentar
          </button>
        </div>
      </div>
      {creating && <form onSubmit={event => { void create(event); }}
        className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-slate-300">Nome da conta
          <input required maxLength={120} value={form.nickname} onChange={e => setForm(v => ({ ...v, nickname: e.target.value }))}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/></label>
        <label className="space-y-1 text-xs text-slate-300">Instituição
          <input required value={form.bank_name} onChange={e => setForm(v => ({ ...v, bank_name: e.target.value }))}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/></label>
        <label className="space-y-1 text-xs text-slate-300">Tipo
          <select value={form.account_type} onChange={e => setForm(v => ({ ...v, account_type: e.target.value }))}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white">
            <option value="CHECKING">Conta corrente</option><option value="SAVINGS">Poupança</option>
            <option value="CASH">Dinheiro</option><option value="INVESTMENT">Investimentos</option>
          </select></label>
        <label className="space-y-1 text-xs text-slate-300">Chave PIX (opcional)
          <input value={form.pix_key} onChange={e => setForm(v => ({ ...v, pix_key: e.target.value }))}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/></label>
        <label className="space-y-1 text-xs text-slate-300">Tipo da chave PIX
          <select value={form.pix_key_type} onChange={e => setForm(v => ({ ...v, pix_key_type: e.target.value }))}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white">
            <option value="">Não informado</option><option value="CPF">CPF</option><option value="CNPJ">CNPJ</option>
            <option value="PHONE">Celular</option><option value="EMAIL">E-mail</option><option value="RANDOM">Aleatória</option>
          </select></label>
        <div className="flex items-end"><button type="submit" disabled={saving}
          className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
          {saving ? 'Salvando...' : 'Cadastrar conta'}
        </button></div>
      </form>}
      {movementOpen && <AccountMovementModal accounts={data.accounts} cards={data.cards}
        expenses={data.expenses} installments={data.installments}
        onClose={() => setMovementOpen(false)} onSaved={async () => { await refresh(); }}/>}
    </>)}
  </WalletPageFrame>;
};
