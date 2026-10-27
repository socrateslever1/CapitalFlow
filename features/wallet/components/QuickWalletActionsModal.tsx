import React, { useEffect, useState } from 'react';
import { CreditCard, Landmark, Plus, SlidersHorizontal, Wallet, X, Check } from 'lucide-react';
import {
  personalWalletService,
  type PersonalWalletAccount,
  type PersonalWalletCard,
  type PersonalWalletExpense,
  type PersonalWalletExpenseInstallment,
} from '../../../services/personalWallet.service';
import { formatMoney } from '../../../utils/formatters';
import { generateUUID } from '../../../utils/generators';
import { getCardCreditPosition } from '../../../components/wallet/invoiceStatementDomain';
import { CardOpeningFields, freshCardOpening, validateCardOpening } from './CardOpeningFields';

export type QuickActionMode = 'EXPENSE' | 'CASH_WALLET' | 'CARD_OPENING';

interface QuickWalletActionsModalProps {
  mode: QuickActionMode;
  accounts: PersonalWalletAccount[];
  cards: PersonalWalletCard[];
  expenses?: PersonalWalletExpense[];
  installments?: PersonalWalletExpenseInstallment[];
  invoicePayments?: unknown[];
  preselectedTarget?: string; // e.g., 'card:uuid' or 'account:uuid'
  preselectedCardId?: string;
  initialCardId?: string | null;
  initialAccountId?: string | null;
  onClose: () => void;
  onSuccess?: (message: string) => Promise<void> | void;
  onSaved?: () => Promise<void> | void;
}

const QUICK_CATEGORIES = [
  'Alimentação',
  'Supermercado',
  'Combustível',
  'Transporte',
  'Saúde',
  'Moradia',
  'Lazer',
  'Assinaturas',
  'Compras',
  'Outros',
];

const QUICK_INSTALLMENTS = ['1', '2', '3', '4', '6', '10', '12'];

const todayISO = () => new Date().toLocaleDateString('en-CA');

export const QuickWalletActionsModal: React.FC<QuickWalletActionsModalProps> = ({
  mode: initialMode,
  accounts,
  cards,
  expenses = [],
  installments = [],
  preselectedTarget,
  preselectedCardId,
  initialCardId,
  initialAccountId,
  onClose,
  onSuccess,
  onSaved,
}) => {
  const [mode, setMode] = useState<QuickActionMode>(initialMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const notifyDone = async (message: string) => {
    if (onSuccess) await onSuccess(message);
    if (onSaved) await onSaved();
  };

  const activeCards = cards.filter((c) => c.status !== 'CANCELED');

  // Default payment source for EXPENSE
  const defaultTarget =
    preselectedTarget ||
    (initialAccountId
      ? `account:${initialAccountId}`
      : initialCardId
        ? `card:${initialCardId}`
        : activeCards[0]
          ? `card:${activeCards[0].id}`
          : accounts[0]
            ? `account:${accounts[0].id}`
            : '');

  const [expenseForm, setExpenseForm] = useState({
    target: defaultTarget,
    description: '',
    amount: '',
    category: 'Compras',
    installment_count: '1',
    expense_date: todayISO(),
    immediate_debit: 'yes',
    notes: '',
  });

  // Physical Wallet form
  const [walletForm, setWalletForm] = useState({
    nickname: 'Carteira física',
    balance: '',
    notes: '',
  });

  // Card Opening / In-use adjustment form
  const [selectedCardId, setSelectedCardId] = useState<string>(
    preselectedCardId || initialCardId || activeCards[0]?.id || '',
  );
  const selectedCard = activeCards.find((c) => c.id === selectedCardId) || null;
  const [cardLimitInput, setCardLimitInput] = useState<string>(
    selectedCard ? String(selectedCard.credit_limit) : '',
  );
  const [openingValues, setOpeningValues] = useState(freshCardOpening);

  useEffect(() => {
    if (!selectedCard) return;
    setCardLimitInput(String(selectedCard.credit_limit || 0));
    const pos = getCardCreditPosition(selectedCard, expenses, installments);
    const currentMonth = (pos.dueMonth || `${todayISO().slice(0, 7)}-01`).slice(0, 7);
    const used = Math.round((pos.currentInvoice + pos.futureCommitments) * 100) / 100;
    setOpeningValues({
      used: String(used),
      invoice: String(pos.currentInvoice),
      future: String(pos.futureCommitments),
      futureCount: '0',
      invoiceMonth: currentMonth,
    });
  }, [selectedCard?.id]);

  const [targetKind, targetId] = expenseForm.target.split(':');

  const submitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError('');
    const amount = Number(String(expenseForm.amount).replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Informe um valor válido maior que zero.');
      return;
    }
    if (!targetId || !['card', 'account'].includes(targetKind)) {
      setError('Selecione o cartão, conta ou carteira onde a despesa ocorreu.');
      return;
    }

    setSaving(true);
    try {
      const description = expenseForm.description.trim() || expenseForm.category || 'Despesa';
      if (targetKind === 'card') {
        await personalWalletService.createExpense({
          description,
          amount,
          category: expenseForm.category || 'Compras',
          expense_date: expenseForm.expense_date || todayISO(),
          card_id: targetId,
          status: 'PENDING',
          installment_count: Math.max(1, Number(expenseForm.installment_count || 1)),
          notes: expenseForm.notes.trim() || null,
        });
      } else {
        // Despesa em Conta Bancária ou Carteira Física
        if (expenseForm.immediate_debit === 'yes') {
          await personalWalletService.recordAccountOperation({
            type: 'EXPENSE',
            fromAccountId: targetId,
            toAccountId: null,
            amount,
            description,
            category: expenseForm.category || 'Despesa',
            date: expenseForm.expense_date || todayISO(),
            requestId: generateUUID(),
          });
        } else {
          await personalWalletService.createExpense({
            description,
            amount,
            category: expenseForm.category || 'Despesa',
            expense_date: expenseForm.expense_date || todayISO(),
            due_date: expenseForm.expense_date || todayISO(),
            account_id: targetId,
            status: 'PENDING',
            installment_count: 1,
            notes: expenseForm.notes.trim() || null,
          });
        }
      }
      await notifyDone('Despesa registrada com sucesso!');
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível registrar a despesa.');
    } finally {
      setSaving(false);
    }
  };

  const submitCashWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError('');
    const nickname = walletForm.nickname.trim() || 'Carteira física';
    const initialBalance = Number(String(walletForm.balance || '0').replace(',', '.'));
    if (!Number.isFinite(initialBalance) || initialBalance < 0) {
      setError('Informe um saldo inicial válido (zero ou positivo).');
      return;
    }
    setSaving(true);
    try {
      await personalWalletService.createAccount({
        nickname,
        bank_name: null,
        account_type: 'CASH',
        balance: initialBalance,
        pix_key: null,
        pix_key_type: null,
        notes: walletForm.notes.trim() || 'Dinheiro em espécie',
      });
      await notifyDone(`Carteira "${nickname}" adicionada com sucesso!`);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível criar a carteira física.');
    } finally {
      setSaving(false);
    }
  };

  const submitCardOpening = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCard || saving) return;
    setError('');
    const newCreditLimit = Number(String(cardLimitInput || '0').replace(',', '.'));
    if (!Number.isFinite(newCreditLimit) || newCreditLimit <= 0) {
      setError('Informe um limite total válido para o cartão.');
      return;
    }

    setSaving(true);
    try {
      const position = validateCardOpening(openingValues, newCreditLimit);

      await personalWalletService.setCardInitialBalances({
        cardId: selectedCard.id,
        creditLimit: newCreditLimit,
        currentInvoice: position.invoice_amount,
        futureCommitments: position.future_amount,
        dueMonth: position.invoice_month,
        requestId: generateUUID(),
      });

      await notifyDone(
        `Posição do cartão ${selectedCard.nickname} atualizada! Crédito livre: ${formatMoney(Math.max(0, newCreditLimit - position.used_limit))}.`,
      );
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível atualizar a posição do cartão.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[2600] flex items-end justify-center bg-slate-950/85 p-0 backdrop-blur-sm sm:items-center sm:p-4 animate-in fade-in"
    >
      <div className="flex max-h-[94dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-slate-800 bg-slate-900 shadow-2xl sm:rounded-3xl">
        {/* Cabeçalho com seletor rápido de modo */}
        <header className="shrink-0 border-b border-slate-800 bg-slate-900/95 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-black uppercase tracking-wider text-white">
              {mode === 'EXPENSE'
                ? 'Lançar Despesa Rápida'
                : mode === 'CASH_WALLET'
                  ? 'Adicionar Carteira Física'
                  : 'Cartão já em Uso (Ajustar Limite)'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="rounded-full bg-slate-800 p-1.5 text-slate-400 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-xl bg-slate-950 p-1 border border-slate-800">
            <button
              type="button"
              onClick={() => { setMode('EXPENSE'); setError(''); }}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-2 text-[11px] font-bold transition-all ${
                mode === 'EXPENSE'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Plus size={13} /> Despesa
            </button>
            <button
              type="button"
              onClick={() => { setMode('CASH_WALLET'); setError(''); }}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-2 text-[11px] font-bold transition-all ${
                mode === 'CASH_WALLET'
                  ? 'bg-amber-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Wallet size={13} /> + Carteira
            </button>
            <button
              type="button"
              onClick={() => { setMode('CARD_OPENING'); setError(''); }}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-2 text-[11px] font-bold transition-all ${
                mode === 'CARD_OPENING'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <SlidersHorizontal size={13} /> Cartão em Uso
            </button>
          </div>
        </header>

        {/* Corpo rolável */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]">
          {error && (
            <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-3 text-xs font-semibold text-rose-200">
              {error}
            </div>
          )}

          {mode === 'EXPENSE' && (
            <form id="quick-wallet-form" onSubmit={submitExpense} className="space-y-4">
              {/* Seleção visual de onde saiu a despesa */}
              <div>
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">
                  1. Onde foi a despesa? (Cartão, Conta ou Carteira)
                </span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 max-h-44 overflow-y-auto pr-1">
                  {activeCards.map((card) => {
                    const pos = getCardCreditPosition(card, expenses, installments);
                    const valueKey = `card:${card.id}`;
                    const isSelected = expenseForm.target === valueKey;
                    return (
                      <button
                        key={valueKey}
                        type="button"
                        onClick={() => setExpenseForm((f) => ({ ...f, target: valueKey }))}
                        className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 text-left transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-950/40 text-white shadow-md'
                            : 'border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <CreditCard size={16} className="text-blue-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold">{card.nickname}</p>
                            <p className="text-[10px] text-emerald-400">Livre: {formatMoney(pos.freeLimit)}</p>
                          </div>
                        </div>
                        {isSelected && <Check size={15} className="text-blue-400 shrink-0" />}
                      </button>
                    );
                  })}

                  {accounts.map((acc) => {
                    const valueKey = `account:${acc.id}`;
                    const isSelected = expenseForm.target === valueKey;
                    const isCash = acc.account_type === 'CASH';
                    return (
                      <button
                        key={valueKey}
                        type="button"
                        onClick={() => setExpenseForm((f) => ({ ...f, target: valueKey }))}
                        className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 text-left transition-all ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-950/40 text-white shadow-md'
                            : 'border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {isCash ? (
                            <Wallet size={16} className="text-amber-400 shrink-0" />
                          ) : (
                            <Landmark size={16} className="text-emerald-400 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold">{acc.nickname}</p>
                            <p className="text-[10px] text-slate-400">Saldo: {formatMoney(Number(acc.balance || 0))}</p>
                          </div>
                        </div>
                        {isSelected && <Check size={15} className="text-emerald-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-300">
                  Valor da Despesa (R$)
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-base font-black text-white outline-none focus:border-blue-500"
                  />
                </label>

                <label className="text-xs font-semibold text-slate-300">
                  Data
                  <input
                    required
                    type="date"
                    value={expenseForm.expense_date}
                    onChange={(e) => setExpenseForm((f) => ({ ...f, expense_date: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white outline-none focus:border-blue-500"
                  />
                </label>

                <label className="text-xs font-semibold text-slate-300 sm:col-span-2">
                  Descrição (o que foi pago/comprado?)
                  <input
                    required
                    type="text"
                    placeholder="Ex.: Supermercado, Gasolina, Almoço, Farmácia..."
                    value={expenseForm.description}
                    onChange={(e) => setExpenseForm((f) => ({ ...f, description: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white outline-none focus:border-blue-500"
                  />
                </label>
              </div>

              {/* Categorias em 1 toque */}
              <div>
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Categoria Rápida
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setExpenseForm((f) => ({ ...f, category: cat }))}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all ${
                        expenseForm.category === cat
                          ? 'bg-blue-600 text-white shadow'
                          : 'border border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Se for Cartão: Parcelamento em 1 toque */}
              {targetKind === 'card' && (
                <div>
                  <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Parcelamento no Cartão
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_INSTALLMENTS.map((inst) => (
                      <button
                        key={inst}
                        type="button"
                        onClick={() => setExpenseForm((f) => ({ ...f, installment_count: inst }))}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                          expenseForm.installment_count === inst
                            ? 'bg-emerald-600 text-white shadow'
                            : 'border border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                        }`}
                      >
                        {inst === '1' ? 'À vista (1x)' : `${inst}x`}
                      </button>
                    ))}
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={expenseForm.installment_count}
                      onChange={(e) => setExpenseForm((f) => ({ ...f, installment_count: e.target.value }))}
                      className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-center text-xs font-bold text-white"
                      title="Número de parcelas"
                    />
                  </div>
                </div>
              )}

              {/* Se for Conta ou Carteira Física: Descontar agora ou agendar */}
              {targetKind === 'account' && (
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                  <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                    Baixa no Saldo da Conta / Carteira
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setExpenseForm((f) => ({ ...f, immediate_debit: 'yes' }))}
                      className={`rounded-lg py-2 px-3 text-xs font-bold border transition-all ${
                        expenseForm.immediate_debit === 'yes'
                          ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300'
                          : 'border-slate-800 text-slate-400'
                      }`}
                    >
                      Pago agora (descontar do saldo)
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpenseForm((f) => ({ ...f, immediate_debit: 'no' }))}
                      className={`rounded-lg py-2 px-3 text-xs font-bold border transition-all ${
                        expenseForm.immediate_debit === 'no'
                          ? 'border-amber-500 bg-amber-950/40 text-amber-300'
                          : 'border-slate-800 text-slate-400'
                      }`}
                    >
                      Deixar pendente
                    </button>
                  </div>
                </div>
              )}
            </form>
          )}

          {mode === 'CASH_WALLET' && (
            <form id="quick-wallet-form" onSubmit={submitCashWallet} className="space-y-4">
              <div className="rounded-2xl border border-amber-500/20 bg-amber-950/10 p-3.5 text-xs text-amber-100">
                Crie uma <strong>Carteira Física</strong> (dinheiro vivo, cofre ou caixinha) para controlar entradas e despesas pagas em espécie separadamente das contas bancárias.
              </div>

              <label className="block text-xs font-semibold text-slate-300">
                Nome da Carteira
                <input
                  required
                  type="text"
                  maxLength={120}
                  placeholder="Ex.: Carteira de Bolso, Cofre Escritório, Dinheiro em Mãos"
                  value={walletForm.nickname}
                  onChange={(e) => setWalletForm((f) => ({ ...f, nickname: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white outline-none focus:border-amber-500"
                />
              </label>

              <label className="block text-xs font-semibold text-slate-300">
                Saldo Atual em Dinheiro (R$)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={walletForm.balance}
                  onChange={(e) => setWalletForm((f) => ({ ...f, balance: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-base font-black text-emerald-300 outline-none focus:border-amber-500"
                />
                <span className="mt-1 block text-[11px] font-normal text-slate-400">
                  Quanto você já tem em mãos nesta carteira agora (pode deixar 0 se estiver vazia).
                </span>
              </label>

              <label className="block text-xs font-semibold text-slate-300">
                Observações (opcional)
                <input
                  type="text"
                  placeholder="Ex.: Uso diário para pequenas despesas"
                  value={walletForm.notes}
                  onChange={(e) => setWalletForm((f) => ({ ...f, notes: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white outline-none focus:border-amber-500"
                />
              </label>
            </form>
          )}

          {mode === 'CARD_OPENING' && (
            <form id="quick-wallet-form" onSubmit={submitCardOpening} className="space-y-4">
              {!activeCards.length ? (
                <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-xs text-slate-400">
                  Cadastre um cartão de crédito primeiro na aba <strong>Cartões</strong> para ajustar sua fatura e limite em uso.
                </div>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-semibold text-slate-300">
                      Selecione o Cartão
                      <select
                        value={selectedCardId}
                        onChange={(e) => setSelectedCardId(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm font-bold text-white outline-none focus:border-emerald-500"
                      >
                        {activeCards.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nickname} ({c.issuer || 'Cartão'})
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-xs font-semibold text-slate-300">
                      Limite Total do Cartão (R$)
                      <input
                        required
                        type="number"
                        min="1"
                        step="0.01"
                        inputMode="decimal"
                        placeholder="Ex.: 10000"
                        value={cardLimitInput}
                        onChange={(e) => setCardLimitInput(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm font-black text-white outline-none focus:border-emerald-500"
                      />
                    </label>
                  </div>

                  <CardOpeningFields
                    creditLimit={Number(String(cardLimitInput || '0').replace(',', '.')) || 0}
                    value={openingValues}
                    onChange={setOpeningValues}
                  />
                </>
              )}
            </form>
          )}
        </div>

        {/* Rodapé fixo */}
        <footer className="shrink-0 flex items-center justify-end gap-2 border-t border-slate-800 bg-slate-900/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-300 hover:text-white"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="quick-wallet-form"
            disabled={saving || (mode === 'CARD_OPENING' && !activeCards.length)}
            className="rounded-xl bg-blue-600 hover:bg-blue-500 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-blue-600/30 disabled:opacity-50"
          >
            {saving
              ? 'Salvando...'
              : mode === 'EXPENSE'
                ? 'Salvar Despesa'
                : mode === 'CASH_WALLET'
                  ? 'Criar Carteira'
                  : 'Aplicar Posição do Cartão'}
          </button>
        </footer>
      </div>
    </div>
  );
};
