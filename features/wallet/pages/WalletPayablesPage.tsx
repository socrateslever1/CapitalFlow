import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, ClipboardList, Plus, Repeat } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import type { UserProfile } from '../../../types';
import { WalletPayablesPanel } from '../../../components/wallet/WalletPayablesPanel';
import { RecurringObligationsPanel } from '../../../components/wallet/RecurringObligationsPanel';
import { personalWalletService } from '../../../services/personalWallet.service';
import { useWalletSnapshot } from '../hooks/useWalletSnapshot';
import { WalletPageFrame } from '../components/WalletPageFrame';
import { Modal, modalPrimaryActionClass } from '../../../components/ui/Modal';
import { parseWalletMoney } from '../utils/parseWalletMoney';
import { formatMoney } from '../../../utils/formatters';
import { PrivateMoney } from '../../../contexts/FinancialPrivacyContext';
import { buildWalletTimeline } from '../domain/walletTimeline';
import { FinancialCalculatorInput } from '../../../components/forms/FinancialCalculatorInput';
import { useWalletDraft } from '../hooks/useWalletDraft';

const emptyPayableForm = {
  description: '', creditor_name: '', creditor_type: 'COMPANY' as 'COMPANY' | 'PERSON',
  category: 'Despesas', total_amount: '', due_date: '', origin: '',
};

export const WalletPayablesPage: React.FC<{ activeUser?: UserProfile | null; onNavigate: (path: string) => void }> = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, loading, error, refresh } = useWalletSnapshot();
  const [creating, setCreating] = useState(false);
  const [createChooserOpen, setCreateChooserOpen] = useState(false);
  const [recurringCreateRequest, setRecurringCreateRequest] = useState<number | undefined>();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [form, setForm, clearFormDraft] = useWalletDraft('payables:new', emptyPayableForm);

  const timelineEvents = useMemo(() => {
    if (!data) return [];
    return buildWalletTimeline({
      referenceDate: new Date().toLocaleDateString('en-CA'),
      operations: data.accountOperations || [],
      expenses: data.expenses || [],
      installments: data.installments || [],
      payables: data.payables || [],
      payablePayments: data.payablePayments || [],
      payablePaymentSources: data.payablePaymentSources || [],
      invoicePayments: data.invoicePayments || [],
      accounts: data.accounts || [],
      cards: data.cards || [],
      limit: 15,
    });
  }, [data]);
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
      const parsedAmount = parseWalletMoney(form.total_amount, 'valor do compromisso');
      if (parsedAmount <= 0) throw new Error('Informe um valor maior que zero para o compromisso.');
      await personalWalletService.createPayable({
        description: form.description, creditor_name: form.creditor_name,
        creditor_type: form.creditor_type, category: form.category,
        total_amount: parsedAmount, due_date: form.due_date || null,
        origin_type: source === 'ACCOUNT' || source === 'CARD' ? source : 'CASH',
        origin_account_id: source === 'ACCOUNT' ? id : null,
        origin_card_id: source === 'CARD' ? id : null,
      });
      await refresh(); setCreating(false);
      clearFormDraft();
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Falha ao cadastrar compromisso.'); }
    finally { setSaving(false); }
  };
  return <WalletPageFrame title="Compromissos" description="Contas a pagar e despesas recorrentes."
    actions={<button type="button" onClick={() => setCreateChooserOpen(true)}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"><Plus size={17} /> Novo compromisso</button>}
    loading={loading} error={error || notice} onRefresh={() => { void refresh().catch(() => { }); }}>
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
            }} />
        </div>
        <div className="min-w-0 border-t border-slate-800 pt-5 lg:col-span-5 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <RecurringObligationsPanel accounts={data.accounts} cards={data.cards}
            items={data.recurringObligations} showCreateButton={false} createRequest={recurringCreateRequest}
            onSaved={async () => { await refresh(); }} />
        </div>
      </div>
      {timelineEvents.length > 0 && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarClock size={18} className="text-blue-400" />
              <h3 className="text-sm font-semibold text-white">Linha do Tempo de Compromissos e Eventos</h3>
            </div>
            <span className="text-xs text-slate-400">{timelineEvents.length} eventos cronológicos</span>
          </div>
          <div className="divide-y divide-slate-800/80">
            {timelineEvents.map(event => (
              <div key={event.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0 rounded-md bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-300">
                    {event.date.slice(8, 10) + '/' + event.date.slice(5, 7) + '/' + event.date.slice(0, 4)}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-100">{event.label}</span>
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-slate-800 text-slate-300">
                        {event.kind === 'PAYABLE' ? 'Conta a Pagar' :
                         event.kind === 'PAYABLE_PAYMENT' ? 'Quitação' :
                         event.kind === 'INSTALLMENT' ? 'Parcela' :
                         (event.kind === 'INVOICE_PAYMENT' || event.kind === 'CARD_INVOICE') ? 'Fatura' :
                         event.kind === 'TRANSFER' ? 'Transferência interna' : 'Operação'}
                      </span>
                    </div>
                    {event.kind === 'PAYABLE_PAYMENT' && event.sources && (
                      <ul aria-label="Origens do pagamento" className="mt-2 space-y-1 text-xs text-slate-300">
                        {event.sources.map((source, index) => (
                          <li key={index} className="flex flex-wrap items-baseline gap-1.5">
                            <span>{source.label}:</span>
                            <span><PrivateMoney value={formatMoney(source.principal)}/></span>
                            {source.cardInterest > 0 && (
                              <span className="text-slate-400">
                                (juros na fatura: <PrivateMoney value={formatMoney(source.cardInterest)}/>)
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {(event.installmentNumber || event.dueMonth) && (
                      <p className="text-xs text-slate-400">
                        {event.installmentNumber ? `Parcela ${event.installmentNumber}` : ''}
                        {event.installmentNumber && event.dueMonth ? ' · ' : ''}
                        {event.dueMonth ? `Ciclo ${event.dueMonth}` : ''}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <span className={`text-xs font-medium ${
                    event.status === 'PAID' ? 'text-emerald-400' :
                    event.status === 'OVERDUE' ? 'text-rose-400' :
                    event.status === 'RECORDED' ? 'text-slate-300' :
                    event.status === 'SCHEDULED' ? 'text-sky-300' : 'text-amber-300'
                  }`}>
                    {event.status === 'PAID' ? 'Pago' :
                     event.status === 'OVERDUE' ? 'Atrasado' :
                     event.status === 'RECORDED' ? 'Registrado' :
                     event.status === 'SCHEDULED' ? 'Agendado' : 'Pendente'}
                  </span>
                  <span className="font-mono text-sm font-semibold text-white">
                    <PrivateMoney value={formatMoney(event.amount)}/>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {createChooserOpen && <Modal compact title="Novo compromisso" subtitle="Escolha o tipo de obrigação" icon={<ClipboardList size={17} />} onClose={() => setCreateChooserOpen(false)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => { setCreateChooserOpen(false); setCreating(true); }}
            className="group rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-left transition hover:border-rose-400/40 hover:bg-rose-500/10">
            <span className="flex items-center gap-2 text-sm font-bold text-white"><ClipboardList size={18} className="text-rose-300" /> Conta a pagar</span>
            <span className="mt-2 block text-xs text-slate-400">Dívidas, parcelas e obrigações pontuais.</span>
          </button>
          <button type="button" onClick={() => { setCreateChooserOpen(false); setRecurringCreateRequest(value => (value ?? 0) + 1); }}
            className="group rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-left transition hover:border-amber-400/40 hover:bg-amber-500/10">
            <span className="flex items-center gap-2 text-sm font-bold text-white"><Repeat size={18} className="text-amber-300" /> Despesa recorrente</span>
            <span className="mt-2 block text-xs text-slate-400">Vencimentos mensais sem débito automático.</span>
          </button>
        </div>
      </Modal>}
      {creating && <Modal title="Nova conta a pagar" subtitle="Dívida, parcela ou obrigação pontual" icon={<ClipboardList size={17} />} panelClassName="sm:rounded-xl" onClose={() => setCreating(false)} busy={saving}
        footer={<button type="submit" form="new-payable-form" disabled={saving} className={modalPrimaryActionClass}>{saving ? 'Salvando...' : 'Salvar compromisso'}</button>}>
        <form id="new-payable-form" onSubmit={event => { void create(event); }} className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-slate-300">Descrição
            <input required value={form.description} onChange={e => setForm(v => ({ ...v, description: e.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" /></label>
          <label className="space-y-1 text-xs text-slate-300">Credor
            <input required value={form.creditor_name} onChange={e => setForm(v => ({ ...v, creditor_name: e.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" /></label>
          <label className="space-y-1 text-xs text-slate-300">Tipo de credor
            <select value={form.creditor_type} onChange={e => setForm(v => ({ ...v, creditor_type: e.target.value as 'COMPANY' | 'PERSON' }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white">
              <option value="COMPANY">Pessoa jurídica</option><option value="PERSON">Pessoa física</option>
            </select></label>
          <label className="space-y-1 text-xs text-slate-300">Categoria
            <input required value={form.category} onChange={e => setForm(v => ({ ...v, category: e.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" /></label>
          <label className="space-y-1 text-xs text-slate-300">Valor (R$)
            <FinancialCalculatorInput required placeholder="0,00" value={form.total_amount}
              onCommit={value => setForm(v => ({ ...v, total_amount: value }))}
              fieldLabel="valor do compromisso"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" /></label>
          <label className="space-y-1 text-xs text-slate-300">Vencimento
            <input type="date" value={form.due_date} onChange={e => setForm(v => ({ ...v, due_date: e.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" /></label>
          <label className="space-y-1 text-xs text-slate-300">Origem do pagamento
            <select value={form.origin} onChange={e => setForm(v => ({ ...v, origin: e.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white">
              <option value="">A definir</option>
              {data.accounts.map(account => <option value={'ACCOUNT:' + account.id} key={account.id}>Conta · {account.nickname}</option>)}
              {data.cards.map(card => <option value={'CARD:' + card.id} key={card.id}>Cartão · {card.nickname}</option>)}
            </select></label>
        </form>
      </Modal>}
    </div>}
  </WalletPageFrame>;
};
