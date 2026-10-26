import React, { useState } from 'react';
import type { UserProfile } from '../../../types';
import { WalletPayablesPanel } from '../../../components/wallet/WalletPayablesPanel';
import { RecurringObligationsPanel } from '../../../components/wallet/RecurringObligationsPanel';
import { personalWalletService } from '../../../services/personalWallet.service';
import { useWalletSnapshot } from '../hooks/useWalletSnapshot';
import { WalletPageFrame } from '../components/WalletPageFrame';

export const WalletPayablesPage: React.FC<{ activeUser?: UserProfile | null; onNavigate: (path: string) => void }> = () => {
  const { data, loading, error, refresh } = useWalletSnapshot();
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({
    description: '', creditor_name: '', creditor_type: 'COMPANY' as 'COMPANY' | 'PERSON',
    category: 'Despesas', total_amount: '', due_date: '', origin: '',
  });
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
  return <WalletPageFrame title="Compromissos" description="Contas, dívidas PF/PJ e vencimentos recorrentes."
    loading={loading} error={error || notice} onRefresh={() => { void refresh().catch(() => {}); }}>
    {data && <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <WalletPayablesPanel payables={data.payables} accounts={data.accounts} cards={data.cards}
            saving={saving} onCreate={() => setCreating(true)}
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
        <div className="min-w-0 lg:col-span-5">
          <RecurringObligationsPanel accounts={data.accounts} cards={data.cards}
            items={data.recurringObligations} onSaved={async () => { await refresh(); }}/>
        </div>
      </div>
      {creating && <form onSubmit={event => { void create(event); }}
        className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:grid-cols-2">
        <h3 className="sm:col-span-2 text-sm font-bold text-white">Novo compromisso</h3>
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
        <div className="flex items-end gap-2">
          <button type="button" onClick={() => setCreating(false)}
            className="rounded-xl border border-slate-700 px-4 py-3 text-xs text-white">Cancelar</button>
          <button type="submit" disabled={saving}
            className="rounded-xl bg-blue-600 px-4 py-3 text-xs font-bold text-white disabled:opacity-50">Salvar</button>
        </div>
      </form>}
    </div>}
  </WalletPageFrame>;
};