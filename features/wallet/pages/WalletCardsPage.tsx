import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { UserProfile } from '../../../types';
import type { PersonalWalletCard } from '../../../services/personalWallet.service';
import { personalWalletService } from '../../../services/personalWallet.service';
import { BankStack } from '../../../components/wallet/BankStack';
import { CardInvoiceStatement } from '../../../components/wallet/CardInvoiceStatement';
import { CardEditModal } from '../../../components/wallet/CardEditModal';
import { PayInvoiceModal } from '../../../components/wallet/PayInvoiceModal';
import { WalletStatementImport } from '../../../components/wallet/WalletStatementImport';
import { InvoiceOverrideModal } from '../../../components/wallet/InvoiceOverrideModal';
import { getCardCreditPosition, getEffectiveInvoiceCycles } from '../../../components/wallet/invoiceStatementDomain';
import { formatMoney } from '../../../utils/formatters';
import { generateUUID } from '../../../utils/generators';
import { CardOpeningFields, freshCardOpening, validateCardOpening } from '../components/CardOpeningFields';
import { useWalletSnapshot } from '../hooks/useWalletSnapshot';
import { WalletPageFrame } from '../components/WalletPageFrame';
import { getCardsForDisplay } from '../cardSummaryNavigation';

export const WalletCardsPage: React.FC<{ activeUser?: UserProfile | null; onNavigate: (path: string) => void }> = () => {
  const [searchParams] = useSearchParams();
  const requestedCardId = searchParams.get('card');
  const { data, loading, error, refresh } = useWalletSnapshot();
  const [selectedId, setSelectedId] = useState<string | null>(requestedCardId);
  const [editing, setEditing] = useState<PersonalWalletCard | null>(null);
  const [paying, setPaying] = useState<PersonalWalletCard | null>(null);
  const [importing, setImporting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newExpense, setNewExpense] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [statementMonth, setStatementMonth] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const requestId = useRef(generateUUID());
  const [opening, setOpening] = useState(freshCardOpening);
  const [initializing, setInitializing] = useState(false);
  const [existingOpening, setExistingOpening] = useState(freshCardOpening);
  const [cardForm, setCardForm] = useState({
    nickname: '', issuer: '', brand: 'Mastercard', last_four: '', credit_limit: '', due_day: '10',
    closing_day: '1', account_id: '',
  });
  const [expenseForm, setExpenseForm] = useState({
    description: '', amount: '', category: 'Compras', installment_count: '1',
  });
  const availableCards = useMemo(() => (data?.cards || []).filter(card => card.status !== 'CANCELED'), [data]);
  const displayedCards = useMemo(
    () => getCardsForDisplay(availableCards, requestedCardId),
    [availableCards, requestedCardId],
  );
  const selected = availableCards.find(card => card.id === selectedId) || displayedCards[0] || null;
  useEffect(() => {
    setSelectedId(requestedCardId);
  }, [requestedCardId]);
  const invoiceCycles = useMemo(() => data && selected
    ? getEffectiveInvoiceCycles(selected.id, data.expenses, data.installments)
    : [], [data, selected]);
  const creditPosition = useMemo(() => data && selected
    ? getCardCreditPosition(selected, data.expenses, data.installments)
    : null, [data, selected]);
  useEffect(() => {
    if (selected) setStatementMonth(creditPosition?.dueMonth || new Date().toLocaleDateString('en-CA').slice(0, 7) + '-01');
  }, [selected?.id, creditPosition?.dueMonth]);
  const mayInitializeExisting = Boolean(selected && data && Number(selected.used_limit) === 0
    && Number(selected.current_bill) === 0
    && !data.expenses.some(expense => expense.card_id === selected.id)
    && !data.invoicePayments.some(payment => payment.card_id === selected.id));

  const createCard = async (event: React.FormEvent) => {
    event.preventDefault(); if (saving) return; setSaving(true); setNotice('');
    try {
      const position = validateCardOpening(opening, Number(cardForm.credit_limit));
      await personalWalletService.createCardWithOpening({
        card: {
          nickname: cardForm.nickname.trim(), issuer: cardForm.issuer.trim(),
          brand: cardForm.brand || null, last_four: cardForm.last_four || null,
          credit_limit: Number(cardForm.credit_limit),
          due_day: Number(cardForm.due_day), closing_day: Number(cardForm.closing_day),
        },
        existingAccountId: cardForm.account_id || null,
        opening: position,
        requestId: requestId.current,
      });
      await refresh(); setCreating(false); setOpening(freshCardOpening());
      requestId.current = generateUUID();
      setCardForm({
        nickname: '', issuer: '', brand: 'Mastercard', last_four: '', credit_limit: '',
        due_day: '10', closing_day: '1', account_id: '',
      });
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Falha ao cadastrar cartão.'); }
    finally { setSaving(false); }
  };
  const initializeExisting = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !mayInitializeExisting || saving) return;
    setSaving(true); setNotice('');
    try {
      const position = validateCardOpening(existingOpening, Number(selected.credit_limit));
      if (position.used_limit === 0) {
        throw new Error('Informe a dívida anterior do cartão ou cancele.');
      }
      await personalWalletService.setCardInitialBalances({
        cardId: selected.id,
        creditLimit: Number(selected.credit_limit),
        currentInvoice: position.invoice_amount,
        futureCommitments: position.future_amount,
        dueMonth: position.invoice_month,
        requestId: generateUUID(),
      });
      await refresh();
      setInitializing(false);
      setExistingOpening(freshCardOpening());
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Falha ao registrar a situação inicial.');
    } finally { setSaving(false); }
  };

  const createExpense = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selected || saving) return; setSaving(true); setNotice('');
    try {
      await personalWalletService.createExpense({
        description: expenseForm.description, amount: Number(expenseForm.amount),
        category: expenseForm.category, expense_date: new Date().toLocaleDateString('en-CA'),
        card_id: selected.id, status: 'PENDING', installment_count: Number(expenseForm.installment_count),
      });
      await refresh(); setNewExpense(false);
      setExpenseForm({ description: '', amount: '', category: 'Compras', installment_count: '1' });
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Falha ao lançar despesa.'); }
    finally { setSaving(false); }
  };
  return <WalletPageFrame title="Cartões e faturas" description="Cartões físicos, extrato editável e pagamentos autorizados."
    error={error || notice} loading={loading} onRefresh={() => { void refresh().catch(() => {}); }}>
    {data && <>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900 p-4 lg:col-span-5">
          <BankStack accounts={data.accounts} cards={displayedCards}
            onAccount={() => {}} onCard={card => setSelectedId(card.id)}
            onEditCard={card => setEditing(card)}
            onSelectionChange={card => setSelectedId(current => current === card?.id ? current : card?.id || null)}
            onCreateCard={() => setCreating(true)}
            onNewExpense={card => { setSelectedId(card.id); setNewExpense(true); }}
            onPayInvoice={card => { setSelectedId(card.id); setPaying(card); }}/>
        </div>
        <div className="min-w-0 space-y-4 lg:col-span-7">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs text-slate-400">Fatura do Mês</p>
              <strong className="block text-xl font-black text-rose-200">{formatMoney(creditPosition?.currentInvoice || 0)}</strong>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs text-slate-400">Parcelas Futuras</p>
              <strong className="block text-xl font-black text-amber-200">{formatMoney(creditPosition?.futureCommitments || 0)}</strong>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 sm:col-span-1">
              <p className="text-xs text-slate-400">Limite Livre</p>
              <strong className="block text-xl font-black text-emerald-300">{formatMoney(creditPosition?.freeLimit || 0)}</strong>
            </div>
          </div>
          {selected && Number(selected.initial_future_installments_balance || 0) > 0 && <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-100">
            {formatMoney(Number(selected.initial_future_installments_balance))} do comprometido futuro ainda não está detalhado em lançamentos. O valor será reduzido conforme as dívidas forem conferidas.
          </p>}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white">Fatura {selected?.nickname || ''}</h3>
                {selected && <select aria-label="Ciclo da fatura" value={statementMonth || ''} onChange={event => setStatementMonth(event.target.value)}
                  className="mt-2 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200">
                  {invoiceCycles.length ? invoiceCycles.map(cycle => <option key={cycle.dueMonth} value={cycle.dueMonth}>{cycle.dueMonth.slice(0, 7).split('-').reverse().join('/')}{cycle.hasOverride ? ' · consolidada' : ''}</option>) : <option value={statementMonth || ''}>{(statementMonth || '').slice(0, 7).split('-').reverse().join('/')}</option>}
                </select>}
              </div>
              {selected && <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setOverriding(true)} className="rounded-xl border border-amber-600/50 px-3 py-2 text-xs font-bold text-amber-200">✏️ Definir Valor da Fatura</button>
                <button type="button" onClick={() => setImporting(true)} className="rounded-xl border border-cyan-700 px-3 py-2 text-xs text-cyan-200">Importar PDF</button>
              </div>}
            </div>
            {selected ? <CardInvoiceStatement cardId={selected.id} dueMonth={statementMonth}
              expenses={data.expenses} installments={data.installments}
              onEdit={async (input, mutationRequestId) => { await personalWalletService.updateExpense(input, mutationRequestId); await refresh(); }}
              onDelete={async (id, mutationRequestId) => { await personalWalletService.cancelExpense(id, mutationRequestId); await refresh(); }}
              className="m-0 border-0 bg-transparent p-0"/> :
              <p className="text-xs text-slate-400">Cadastre um cartão para visualizar o extrato.</p>}
          </div>
        </div>
      </div>
      {creating && <form onSubmit={event => { void createCard(event); }}
        className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:grid-cols-2">
        <h3 className="sm:col-span-2 text-sm font-bold text-white">Novo cartão</h3>
        {(['nickname', 'issuer', 'brand', 'last_four', 'credit_limit', 'closing_day', 'due_day'] as const).map(field =>
          <label key={field} className="space-y-1 text-xs text-slate-300">
            {({nickname:'Apelido',issuer:'Instituição',brand:'Bandeira',last_four:'Últimos 4 dígitos',
              credit_limit:'Limite de crédito',closing_day:'Dia de fechamento',due_day:'Dia do vencimento'} as const)[field]}
            <input required={field !== 'last_four'} type={['credit_limit','closing_day','due_day'].includes(field) ? 'number':'text'}
              min={field === 'credit_limit' ? 0 : field === 'closing_day' || field === 'due_day' ? 1 : undefined}
              max={field === 'closing_day' || field === 'due_day' ? 31 : undefined}
              value={cardForm[field]} onChange={e => { requestId.current = generateUUID(); setCardForm(v => ({ ...v, [field]: e.target.value })); }}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/></label>)}
        <label className="space-y-1 text-xs text-slate-300">Conta vinculada (opcional)
          <select value={cardForm.account_id} onChange={e => { requestId.current = generateUUID(); setCardForm(v => ({ ...v, account_id: e.target.value })); }}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white">
            <option value="">Cartão independente</option>
            {data.accounts.map(account => <option key={account.id} value={account.id}>{account.nickname}</option>)}
          </select>
        </label>
        <div className="sm:col-span-2">
          <CardOpeningFields value={opening} creditLimit={Number(cardForm.credit_limit) || 0}
            onChange={value => { requestId.current = generateUUID(); setOpening(value); }}/>
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <button type="button" onClick={() => setCreating(false)} className="rounded-xl border border-slate-700 px-4 py-3 text-xs text-white">Cancelar</button>
          <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-4 py-3 text-xs font-bold text-white disabled:opacity-50">Salvar cartão</button>
        </div>
      </form>}
      {mayInitializeExisting && !creating && !newExpense && selected && <section className="rounded-2xl border border-amber-700/25 bg-slate-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white">Cartão já estava em uso?</h3>
            <p className="mt-1 text-xs text-slate-400">Informe uma única vez a fatura e o limite já utilizados.</p>
          </div>
          <button type="button" onClick={() => setInitializing(value => !value)}
            className="rounded-xl border border-amber-600/40 px-3 py-2 text-xs font-bold text-amber-200">
            {initializing ? 'Fechar' : 'Informar saldo inicial'}
          </button>
        </div>
        {initializing && <form onSubmit={event => { void initializeExisting(event); }} className="mt-4 space-y-3">
          <CardOpeningFields creditLimit={Number(selected.credit_limit)} value={existingOpening} onChange={setExistingOpening}/>
          <button type="submit" disabled={saving}
            className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
            {saving ? 'Salvando...' : 'Registrar situação inicial'}
          </button>
        </form>}
      </section>}
      {newExpense && selected && <form onSubmit={event => { void createExpense(event); }}
        className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:grid-cols-2">
        <h3 className="sm:col-span-2 text-sm font-bold text-white">Nova despesa em {selected.nickname}</h3>
        {(['description','amount','category','installment_count'] as const).map(field =>
          <label key={field} className="space-y-1 text-xs text-slate-300">
            {({description:'Descrição',amount:'Valor',category:'Categoria',installment_count:'Parcelas'} as const)[field]}
            <input required type={field === 'amount' || field === 'installment_count' ? 'number':'text'}
              min={field === 'installment_count' ? 1 : undefined} step={field === 'amount' ? '0.01' : undefined}
              value={expenseForm[field]} onChange={e => setExpenseForm(v => ({ ...v, [field]: e.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/></label>)}
        <div className="flex gap-2 sm:col-span-2">
          <button type="button" onClick={() => setNewExpense(false)} className="rounded-xl border border-slate-700 px-4 py-3 text-xs text-white">Cancelar</button>
          <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-4 py-3 text-xs font-bold text-white disabled:opacity-50">Registrar despesa</button>
        </div>
      </form>}
      {editing && <CardEditModal card={editing} accounts={data.accounts} onClose={() => setEditing(null)} onSaved={async () => { await refresh(); }}/>}
      {importing && selected && <WalletStatementImport kind="CARD" targetId={selected.id}
        targetName={selected.nickname} onClose={() => setImporting(false)}
        onImported={async () => { await refresh(); setImporting(false); }}/>}
      {paying && <PayInvoiceModal card={paying} accounts={data.accounts}
        invoiceAmount={paying.id === selected?.id ? creditPosition?.currentInvoice || 0 : 0}
        dueMonth={creditPosition?.dueMonth} onClose={() => setPaying(null)}
        onPay={async (cardId, month, accountId, amount, requestId) => {
          await personalWalletService.payInvoicePartial(cardId, month, accountId, amount, requestId);
          await refresh();
        }}/>}
      {overriding && selected && <InvoiceOverrideModal card={selected}
        initialDueMonth={statementMonth || creditPosition?.dueMonth || new Date().toLocaleDateString('en-CA').slice(0, 7) + '-01'}
        initialAmount={invoiceCycles.find(cycle => cycle.dueMonth === statementMonth)?.amount || 0}
        onClose={() => setOverriding(false)}
        onSave={async (dueMonth, amount, overrideRequestId) => {
          await personalWalletService.setMonthlyInvoiceOverride({ cardId: selected.id, dueMonth, amount, requestId: overrideRequestId });
          await refresh();
          setStatementMonth(dueMonth);
        }}/>} 
    </>}
  </WalletPageFrame>;
};
