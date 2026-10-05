import { supabase } from '../lib/supabase';

export type PersonalWalletAccount = {
  id: string;
  nickname: string;
  bank_name: string | null;
  account_type: string;
  balance: number;
  pix_key?: string | null;
  pix_key_type?: string | null;
  notes?: string | null;
};

export type PersonalWalletCard = {
  id: string;
  nickname: string;
  issuer: string | null;
  brand: string | null;
  last_four: string | null;
  credit_limit: number;
  used_limit: number;
  closing_day: number | null;
  due_day: number | null;
  current_bill: number;
  status: string;
  notes?: string | null;
};

export type PersonalWalletExpense = {
  id: string;
  description: string;
  amount: number;
  category: string;
  expense_date: string;
  due_date: string | null;
  status: string;
  installment_count: number;
  account_id?: string | null;
  card_id?: string | null;
  notes?: string | null;
};

export type PersonalWalletExpenseInstallment = {
  id: string;
  expense_id: string;
  installment_number: number;
  due_month: string;
  amount: number;
  status: 'PENDING' | 'PAID' | 'CANCELED';
};

export type CreatePersonalWalletExpense = {
  description: string;
  amount: number;
  category: string;
  expense_date: string;
  due_date?: string | null;
  account_id?: string | null;
  card_id?: string | null;
  status?: 'PENDING' | 'PAID';
  installment_count?: number;
  recurrence?: string | null;
  notes?: string | null;
};

export const personalWalletService = {
  async ownerId() {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.id) throw new Error('Sessão não encontrada.');
    return data.user.id;
  },

  async load() {
    const [accounts, cards, expenses, installments] = await Promise.all([
      supabase.from('personal_wallet_accounts').select('*').order('created_at', { ascending: false }),
      supabase.from('personal_wallet_cards').select('*').order('created_at', { ascending: false }),
      supabase.from('personal_wallet_expenses').select('*').order('expense_date', { ascending: false }),
      supabase.from('personal_wallet_expense_installments').select('*').order('due_month', { ascending: true }),
    ]);
    const error = accounts.error || cards.error || expenses.error || installments.error;
    if (error) throw new Error(error.message);
    return {
      accounts: (accounts.data || []) as PersonalWalletAccount[],
      cards: (cards.data || []) as PersonalWalletCard[],
      expenses: (expenses.data || []) as PersonalWalletExpense[],
      installments: (installments.data || []) as PersonalWalletExpenseInstallment[],
    };
  },

  async createAccount(input: Omit<PersonalWalletAccount, 'id' | 'balance'> & { balance?: number }) {
    const { data, error } = await supabase.from('personal_wallet_accounts').insert({ ...input, owner_user_id: await this.ownerId() }).select().single();
    if (error) throw new Error(error.message);
    return data as PersonalWalletAccount;
  },

  async createCard(input: Omit<PersonalWalletCard, 'id' | 'used_limit' | 'current_bill' | 'status'> & { used_limit?: number; current_bill?: number; status?: string }) {
    const { data, error } = await supabase.from('personal_wallet_cards').insert({ ...input, owner_user_id: await this.ownerId() }).select().single();
    if (error) throw new Error(error.message);
    return data as PersonalWalletCard;
  },

  async createExpense(input: CreatePersonalWalletExpense) {
    const { data, error } = await supabase.rpc('personal_wallet_create_expense', {
      p_description: input.description,
      p_amount: input.amount,
      p_category: input.category,
      p_expense_date: input.expense_date,
      p_due_date: input.due_date || null,
      p_account_id: input.account_id || null,
      p_card_id: input.card_id || null,
      p_status: input.status || 'PENDING',
      p_installment_count: input.installment_count || 1,
      p_recurrence: input.recurrence || null,
      p_notes: input.notes || null,
    });
    if (error) throw new Error(error.message);
    return String(data);
  },

  async setExpenseStatus(expenseId: string, status: 'PAID' | 'CANCELED') {
    const { error } = await supabase.rpc('personal_wallet_set_expense_status', {
      p_expense_id: expenseId,
      p_status: status,
    });
    if (error) throw new Error(error.message);
  },

  async payInvoice(cardId: string, dueMonth: string, accountId: string) {
    const { data, error } = await supabase.rpc('personal_wallet_pay_invoice', {
      p_card_id: cardId,
      p_due_month: dueMonth,
      p_account_id: accountId,
    });
    if (error) throw new Error(error.message);
    return Number(data || 0);
  },
};
