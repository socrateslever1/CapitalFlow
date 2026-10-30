import React, { useEffect, useState } from 'react';
import { ArrowLeftRight, Plus, QrCode, Wallet } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import type { UserProfile } from '../../../types';
import { AccountCardStack } from '../../../components/wallet/AccountCardStack';
import { AccountDetailsPage } from '../../../components/wallet/AccountDetailsPage';
import { formatMoney } from '../../../utils/formatters';
import { personalWalletService } from '../../../services/personalWallet.service';
import { useWalletSnapshot } from '../hooks/useWalletSnapshot';
import { WalletPageFrame } from '../components/WalletPageFrame';
import { AccountMovementModal } from '../../../components/wallet/AccountMovementModal';
import { WalletPixCharge } from '../../../components/wallet/WalletPixCharge';
import { CreateAccountModal } from '../../../components/wallet/CreateAccountModal';
import { WalletCapitalLinks } from '../components/WalletCapitalLinks';

export const WalletAccountsPage: React.FC<{ activeUser?: UserProfile | null; onNavigate: (path: string) => void }> = ({ activeUser }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, loading, error, refresh } = useWalletSnapshot();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createModalType, setCreateModalType] = useState<'CHECKING' | 'CASH' | null>(null);
  const [movementOpen, setMovementOpen] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ nickname: '', bank_name: '', account_type: 'CHECKING', pix_key: '', pix_key_type: '', capital_source_id: '' });
  const isPhysicalWallet = form.account_type === 'CASH';
  const startCreate = (accountType: 'CHECKING' | 'CASH') => {
    setForm({
      nickname: accountType === 'CASH' ? 'Carteira física' : '',
      bank_name: '',
      account_type: accountType,
      pix_key: '',
      pix_key_type: '',
      capital_source_id: '',
    });
    setCreateModalType(accountType);
    setMessage('');
  };
  useEffect(() => {
    if (searchParams.get('acao') !== 'nova-conta') return;
    startCreate('CHECKING');
    const next = new URLSearchParams(searchParams);
    next.delete('acao');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const selected = data?.accounts.find(account => account.id === selectedId);
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setMessage('');
    try {
      await personalWalletService.createAccount({
        nickname: form.nickname.trim(), bank_name: isPhysicalWallet ? null : form.bank_name.trim(),
        account_type: form.account_type, balance: 0,
        pix_key: isPhysicalWallet ? null : form.pix_key.trim() || null,
        pix_key_type: isPhysicalWallet ? null : form.pix_key.trim() ? form.pix_key_type || null : null,
        capital_source_id: form.capital_source_id || null,
      });
      await refresh();
      setCreating(false);
      setForm({ nickname: '', bank_name: '', account_type: 'CHECKING', pix_key: '', pix_key_type: '', capital_source_id: '' });
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Falha ao cadastrar conta.'); }
    finally { setSaving(false); }
  };

  const totalBalance = data?.accounts.reduce((total, account) => total + Number(account.balance || 0), 0) || 0;
  const hasPixAccount = Boolean(data?.accounts.some(account => account.pix_key?.trim()));

  return <WalletPageFrame title="Contas e PIX" description="Consulte os saldos e organize os movimentos de cada instituição."
    error={error || message} loading={loading} onRefresh={() => { void refresh().catch(() => {}); }}>
    {data && (selected ? <AccountDetailsPage account={selected} accounts={data.accounts} cards={data.cards} capitalSources={data.capitalSources}
      expenses={data.expenses} installments={data.installments} invoicePayments={data.invoicePayments} accountOperations={data.accountOperations}
      statementRows={data.statementRows} onBack={() => setSelectedId(null)} onSaved={async () => { await refresh(); }}
      ownerName={activeUser?.fullName || activeUser?.name} ownerCity={activeUser?.city}/> : <>
      {/* Composição mobile-first (1: Resumo no topo, 2: Contas em lista, 3: Ações abaixo) e desktop 8/4 equilibrado */}
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-12">
        {/* 1. Resumo no topo no celular / Lateral superior no desktop */}
        <aside aria-label="Resumo e movimentações" className="order-1 min-w-0 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5 lg:order-2 lg:col-span-4">
          <p className="text-sm font-semibold text-slate-300">Liquidez em contas</p>
          <strong className={`mt-2 block break-words text-2xl font-bold tabular-nums tracking-tight ${totalBalance < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
            {formatMoney(totalBalance)}
          </strong>
          <p className="mt-1.5 text-xs sm:text-sm text-slate-300">
            {data.accounts.length} {data.accounts.length === 1 ? 'conta registrada' : 'contas registradas'}
          </p>

          {/* No desktop, as ações ficam integradas ao card lateral de resumo para evitar botões soltos e espaço vazio */}
          <div className="mt-5 hidden space-y-2.5 border-t border-slate-800 pt-4 lg:block">
            <button type="button" onClick={() => setMovementOpen(true)} disabled={!data.accounts.length}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40">
              <ArrowLeftRight size={17}/> Transferir / Movimentar
            </button>
            <button type="button" onClick={() => setChargeOpen(true)} disabled={!hasPixAccount}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40">
              <QrCode size={16} className="text-blue-300"/> Gerar cobrança PIX
            </button>
          </div>
        </aside>

        {/* 2. Lista de contas (maior largura no desktop lg:col-span-8, meio no celular) com "Nova conta" junto ao título */}
        <div className="order-2 min-w-0 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5 lg:order-1 lg:col-span-8 lg:row-span-2">
          <AccountCardStack
            accounts={data.accounts}
            onOpen={account => setSelectedId(account.id)}
            headerActions={
              <>
                <button type="button" onClick={() => startCreate('CASH')}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
                  <Wallet size={15} className="text-amber-300"/>Adicionar carteira física
                </button>
                <button
                  type="button"
                  onClick={() => startCreate('CHECKING')}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  <Plus size={16} />
                  <span>Nova conta</span>
                </button>
              </>
            }
          />
        </div>

        {/* 3. Ações abaixo da lista no celular + Integração com Capital na coluna lateral */}
        <div className="order-3 min-w-0 space-y-4 lg:order-3 lg:col-span-4">
          <div className="grid gap-2.5 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:grid-cols-2 lg:hidden">
            <button type="button" onClick={() => setMovementOpen(true)} disabled={!data.accounts.length}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40">
              <ArrowLeftRight size={18}/> Transferir / Movimentar
            </button>
            <button type="button" onClick={() => setChargeOpen(true)} disabled={!hasPixAccount}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40">
              <QrCode size={17} className="text-blue-300"/> Gerar cobrança PIX
            </button>
          </div>
          <WalletCapitalLinks accounts={data.accounts} sources={data.capitalSources}/>
        </div>
      </div>
      {creating && <form onSubmit={event => { void create(event); }}
        className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-slate-300">Nome da conta
          <input required maxLength={120} value={form.nickname} onChange={e => setForm(v => ({ ...v, nickname: e.target.value }))}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/></label>
        <label className="space-y-1 text-xs text-slate-300">Instituição {isPhysicalWallet && <span className="text-slate-500">(opcional)</span>}
          <input required={!isPhysicalWallet} disabled={isPhysicalWallet} value={form.bank_name} placeholder={isPhysicalWallet ? 'Não se aplica à carteira física' : 'Ex.: Nubank'} onChange={e => setForm(v => ({ ...v, bank_name: e.target.value }))}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white disabled:cursor-not-allowed disabled:opacity-50"/></label>
        <label className="space-y-1 text-xs text-slate-300">Tipo
          <select value={form.account_type} onChange={e => setForm(v => ({ ...v, account_type: e.target.value }))}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white">
            <option value="CHECKING">Conta corrente</option><option value="PAYMENT">Conta de pagamento</option><option value="SAVINGS">Poupança</option>
            <option value="CASH">Carteira física</option><option value="INVESTMENT">Investimentos</option>
          </select></label>
        {!isPhysicalWallet ? <>
          <label className="space-y-1 text-xs text-slate-300">Chave PIX (opcional)
            <input value={form.pix_key} onChange={e => setForm(v => ({ ...v, pix_key: e.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/></label>
          <label className="space-y-1 text-xs text-slate-300">Tipo da chave PIX
            <select value={form.pix_key_type} onChange={e => setForm(v => ({ ...v, pix_key_type: e.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white">
              <option value="">Não informado</option><option value="CPF">CPF</option><option value="CNPJ">CNPJ</option>
              <option value="PHONE">Celular</option><option value="EMAIL">E-mail</option><option value="RANDOM">Aleatória</option>
            </select></label>
        </> : <div className="flex items-center rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-100 sm:col-span-2">
          Carteira física representa dinheiro em espécie e não precisa de instituição ou chave PIX.
        </div>}
        <label className="space-y-1 text-xs text-slate-300 sm:col-span-2">Fonte de capital vinculada (opcional)
          <select value={form.capital_source_id} onChange={e => setForm(v => ({ ...v, capital_source_id: e.target.value }))}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white">
            <option value="">Nenhuma conta de origem vinculada</option>
            {(data?.capitalSources || []).map(source => <option key={source.id} value={source.id}>{source.name} · {formatMoney(Number(source.balance || 0))}</option>)}
          </select>
          <span className="block text-[11px] text-slate-500">A vinculação ativa o débito de empréstimos e o crédito de parcelas nesta conta, somente quando a integração estiver autorizada.</span>
        </label>
        <div className="flex items-end"><button type="submit" disabled={saving}
          className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
          {saving ? 'Salvando...' : 'Cadastrar conta'}
        </button></div>
      </form>}
      {createModalType && (
        <CreateAccountModal
          activeUser={activeUser}
          capitalSources={data.capitalSources || []}
          initialAccountType={createModalType}
          onClose={() => setCreateModalType(null)}
          onSaved={async () => { await refresh(); }}
        />
      )}
      {movementOpen && <AccountMovementModal accounts={data.accounts} cards={data.cards}
        expenses={data.expenses} installments={data.installments}
        onClose={() => setMovementOpen(false)} onSaved={async () => { await refresh(); }}/>}
      {chargeOpen && <WalletPixCharge embedded accounts={data.accounts} recipient={activeUser?.fullName || activeUser?.name || ''}
        city={activeUser?.city} onClose={() => setChargeOpen(false)} onSaved={async () => { await refresh(); }}/>}
    </>)}
  </WalletPageFrame>;
};
