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

export const personalWalletService = {
  async ownerId() {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.id) throw new Error('Sessão não encontrada.');
    return data.user.id;
  },

  async load() {
    const [accounts, cards, expenses] = await Promise.all([
      supabase.from('personal_wallet_accounts').select('*').order('created_at', { ascending: false }),
      supabase.from('personal_wallet_cards').select('*').order('created_at', { ascending: false }),
      supabase.from('personal_wallet_expenses').select('*').order('expense_date', { ascending: false }),
    ]);
    const error = accounts.error || cards.error || expenses.error;
    if (error) throw new Error(error.message);
    return {
      accounts: (accounts.data || []) as PersonalWalletAccount[],
      cards: (cards.data || []) as PersonalWalletCard[],
      expenses: (expenses.data || []) as PersonalWalletExpense[],
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

  async createExpense(input: Omit<PersonalWalletExpense, 'id' | 'status' | 'installment_count'> & { status?: string; installment_count?: number }) {
    const { data, error } = await supabase.from('personal_wallet_expenses').insert({ ...input, owner_user_id: await this.ownerId() }).select().single();
    if (error) throw new Error(error.message);
    return data as PersonalWalletExpense;
  },
};
