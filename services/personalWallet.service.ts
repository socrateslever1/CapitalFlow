import { supabase } from '../lib/supabase';

const CARD_IMAGES_BUCKET = 'personal-wallet-cards';
const ACCOUNT_IMAGES_BUCKET = 'personal-wallet-accounts';
const MAX_CARD_IMAGE_SIZE = 5 * 1024 * 1024;
const CARD_IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export type PersonalWalletAccount = {
  id: string;
  nickname: string;
  bank_name: string | null;
  account_type: string;
  balance: number;
  pix_key?: string | null;
  pix_key_type?: string | null;
  image_path?: string | null;
  image_url?: string | null;
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
  image_path?: string | null;
  image_url?: string | null;
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
    const cardsWithImages = await Promise.all(((cards.data || []) as PersonalWalletCard[]).map(async (card) => {
      if (!card.image_path) return card;
      const signed = await supabase.storage.from(CARD_IMAGES_BUCKET).createSignedUrl(card.image_path, 3600);
      return { ...card, image_url: signed.data?.signedUrl || null };
    }));
    const accountsWithImages = await Promise.all(((accounts.data || []) as PersonalWalletAccount[]).map(async (account) => {
      if (!account.image_path) return account;
      const signed = await supabase.storage.from(ACCOUNT_IMAGES_BUCKET).createSignedUrl(account.image_path, 3600);
      return { ...account, image_url: signed.data?.signedUrl || null };
    }));
    return {
      accounts: accountsWithImages,
      cards: cardsWithImages,
      expenses: (expenses.data || []) as PersonalWalletExpense[],
      installments: (installments.data || []) as PersonalWalletExpenseInstallment[],
    };
  },

  async createAccount(
    input: Omit<PersonalWalletAccount, 'id' | 'balance' | 'image_url' | 'image_path'> & { balance?: number },
    imageFile?: File | null,
  ) {
    const ownerUserId = await this.ownerId();
    const accountId = crypto.randomUUID();
    let imagePath: string | null = null;

    if (imageFile) {
      const extension = CARD_IMAGE_EXTENSIONS[imageFile.type];
      if (!extension) throw new Error('Use uma imagem JPEG, PNG ou WebP.');
      if (imageFile.size > MAX_CARD_IMAGE_SIZE) throw new Error('A imagem da conta deve ter no máximo 5 MB.');
      imagePath = `${ownerUserId}/${accountId}/account.${extension}`;
      const uploaded = await supabase.storage.from(ACCOUNT_IMAGES_BUCKET).upload(imagePath, imageFile, {
        contentType: imageFile.type,
        upsert: false,
      });
      if (uploaded.error) throw new Error(`Falha ao enviar a imagem da conta: ${uploaded.error.message}`);
    }

    const { data, error } = await supabase
      .from('personal_wallet_accounts')
      .insert({ ...input, id: accountId, owner_user_id: ownerUserId, image_path: imagePath })
      .select()
      .single();
    if (error) {
      if (imagePath) await supabase.storage.from(ACCOUNT_IMAGES_BUCKET).remove([imagePath]);
      throw new Error(error.message);
    }
    return data as PersonalWalletAccount;
  },

  async createCard(
    input: Omit<PersonalWalletCard, 'id' | 'used_limit' | 'current_bill' | 'status' | 'image_url' | 'image_path'> & { used_limit?: number; current_bill?: number; status?: string },
    imageFile?: File | null,
  ) {
    const ownerUserId = await this.ownerId();
    const cardId = crypto.randomUUID();
    let imagePath: string | null = null;

    if (imageFile) {
      const extension = CARD_IMAGE_EXTENSIONS[imageFile.type];
      if (!extension) throw new Error('Use uma imagem JPEG, PNG ou WebP.');
      if (imageFile.size > MAX_CARD_IMAGE_SIZE) throw new Error('A imagem do cartão deve ter no máximo 5 MB.');
      imagePath = `${ownerUserId}/${cardId}/card.${extension}`;
      const uploaded = await supabase.storage.from(CARD_IMAGES_BUCKET).upload(imagePath, imageFile, {
        contentType: imageFile.type,
        upsert: false,
      });
      if (uploaded.error) throw new Error(`Falha ao enviar a imagem do cartão: ${uploaded.error.message}`);
    }

    const { data, error } = await supabase
      .from('personal_wallet_cards')
      .insert({ ...input, id: cardId, owner_user_id: ownerUserId, image_path: imagePath })
      .select()
      .single();
    if (error) {
      if (imagePath) await supabase.storage.from(CARD_IMAGES_BUCKET).remove([imagePath]);
      throw new Error(error.message);
    }
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
