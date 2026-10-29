import React, { useEffect, useState } from 'react';
import { ClipboardList, Plus, Repeat } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import type { UserProfile } from '../../../types';
import { WalletPayablesPanel } from '../../../components/wallet/WalletPayablesPanel';
import { RecurringObligationsPanel } from '../../../components/wallet/RecurringObligationsPanel';
import { personalWalletService } from '../../../services/personalWallet.service';
import { useWalletSnapshot } from '../hooks/useWalletSnapshot';
import { WalletPageFrame } from '../components/WalletPageFrame';
import { Modal, modalPrimaryActionClass } from '../../../components/ui/Modal';

export const WalletPayablesPage: React.FC<{ activeUser?: UserProfile | null; onNavigate: (path: string) => void }> = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, loading, error, refresh } = useWalletSnapshot();
  const [creating, setCreating] = useState(false);
  const [createChooserOpen, setCreateChooserOpen] = useState(false);
  const [recurringCreateRequest, setRecurringCreateRequest] = useState<number | undefined>();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({
    description: '', creditor_name: '', creditor_type: 'COMPANY' as 'COMPANY' | 'PERSON',
    category: 'Despesas', total_amount: '', due_date: '', origin: '',
  });
  useEffect(() => {
    if (searchParams.get('acao') !== 'novo-compromisso') return;
    setCreateChooserOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('acao');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const create = async (event: React.FormEvent) => {
    event.preventDefault(); if (saving) return;
    setSaving(true); setNotice('');
    const [source, id] = form.origin.split(':');
    try {
      await personalWalletService.createPayable({
        description: form.description, creditor_name: form.creditor_name,
        creditor_type: form.creditor_type, category: form.category,
        total_amount: Number(form.total_amount), due_date: form.due_date || null,
        origin_type: source === 'ACCOUNT' || source === 'CARD' ? source : 'CASH',
        origin_account_id: source === 'ACCOUNT' ? id : null,
        origin_card_id: source === 'CARD' ? id : null,
      });
      await refresh(); setCreating(false);
      setForm({ description: '', creditor_name: '', creditor_type: 'COMPANY',
        category: 'Despesas', total_amount: '', due_date: '', origin: '' });
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Falha ao cadastrar compromisso.'); }
    finally { setSaving(false); }
  };
  return <WalletPageFrame title="Compromissos" description="Contas a pagar e despesas recorrentes."
    actions={<button type="button" onClick={() => setCreateChooserOpen(true)}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"><Plus size={17}/> Novo compromisso</button>}
    loading={loading} error={error || notice} onRefresh={() => { void refresh().catch(() => {}); }}>
    {data && <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <WalletPayablesPanel payables={data.payables} accounts={data.accounts} cards={data.cards}
            saving={saving} showCreateButton={false}
            onPay={async input => {
              setSaving(true); setNotice('');
              try {
                await personalWalletService.payPayable(input);
                await refresh();
              } catch (cause) {
                setNotice(cause instanceof Error ? cause.message : 'Pagamento não realizado.');
                throw cause;
              } finally { setSaving(false); }
            }}/>
        </div>
        <div className="min-w-0 border-t border-slate-800 pt-5 lg:col-span-5 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <RecurringObligationsPanel accounts={data.accounts} cards={data.cards}
            items={data.recurringObligations} showCreateButton={false} createRequest={recurringCreateRequest}
            onSaved={async () => { await refresh(); }}/>
        </div>
      </div>
      {createChooserOpen && <Modal compact title="Novo compromisso" subtitle="Escolha o tipo de obrigação" icon={<ClipboardList size={17}/>} onClose={() => setCreateChooserOpen(false)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => { setCreateChooserOpen(false); setCreating(true); }}
            className="group rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-left transition hover:border-rose-400/40 hover:bg-rose-500/10">
            <span className="flex items-center gap-2 text-sm font-bold text-white"><ClipboardList size={18} className="text-rose-300"/> Conta a pagar</span>
            <span className="mt-2 block text-xs text-slate-400">Dívidas, parcelas e obrigações pontuais.</span>
          </button>
          <button type="button" onClick={() => { setCreateChooserOpen(false); setRecurringCreateRequest(value => (value ?? 0) + 1); }}
            className="group rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-left transition hover:border-amber-400/40 hover:bg-amber-500/10">
            <span className="flex items-center gap-2 text-sm font-bold text-white"><Repeat size={18} className="text-amber-300"/> Despesa recorrente</span>
            <span className="mt-2 block text-xs text-slate-400">Vencimentos mensais sem débito automático.</span>
          </button>
        </div>
      </Modal>}
      {creating && <Modal title="Nova conta a pagar" subtitle="Dívida, parcela ou obrigação pontual" icon={<ClipboardList size={17}/>} onClose={() => setCreating(false)} busy={saving}
        footer={<button type="submit" form="new-payable-form" disabled={saving} className={modalPrimaryActionClass}>{saving ? 'Salvando...' : 'Salvar compromisso'}</button>}>
        <form id="new-payable-form" onSubmit={event => { void create(event); }} className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-slate-300">Descrição
          <input required value={form.description} onChange={e => setForm(v => ({ ...v, description: e.target.value }))}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/></label>
        <label className="space-y-1 text-xs text-slate-300">Credor
          <input required value={form.creditor_name} onChange={e => setForm(v => ({ ...v, creditor_name: e.target.value }))}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/></label>
        <label className="space-y-1 text-xs text-slate-300">Tipo de credor
          <select value={form.creditor_type} onChange={e => setForm(v => ({ ...v, creditor_type: e.target.value as 'COMPANY'|'PERSON' }))}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white">
            <option value="COMPANY">Pessoa jurídica</option><option value="PERSON">Pessoa física</option>
          </select></label>
        <label className="space-y-1 text-xs text-slate-300">Categoria
          <input required value={form.category} onChange={e => setForm(v => ({ ...v, category: e.target.value }))}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/></label>
        <label className="space-y-1 text-xs text-slate-300">Valor
          <input required type="number" min="0.01" step="0.01" value={form.total_amount}
            onChange={e => setForm(v => ({ ...v, total_amount: e.target.value }))}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/></label>
        <label className="space-y-1 text-xs text-slate-300">Vencimento
          <input type="date" value={form.due_date} onChange={e => setForm(v => ({ ...v, due_date: e.target.value }))}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/></label>
        <label className="space-y-1 text-xs text-slate-300">Origem do pagamento
          <select value={form.origin} onChange={e => setForm(v => ({ ...v, origin: e.target.value }))}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white">
            <option value="">A definir</option>
            {data.accounts.map(account => <option value={'ACCOUNT:'+account.id} key={account.id}>Conta · {account.nickname}</option>)}
            {data.cards.map(card => <option value={'CARD:'+card.id} key={card.id}>Cartão · {card.nickname}</option>)}
          </select></label>
        </form>
      </Modal>}
    </div>}
  </WalletPageFrame>;
};
