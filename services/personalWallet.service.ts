import { supabase } from '../lib/supabase';
import { generateUUID } from '../utils/generators';

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
  account_id?: string | null;
};

export type PersonalWalletPayable = {
  id: string;
  creditor_name: string;
  creditor_type: 'PERSON' | 'COMPANY';
  description: string;
  amount: number;
  due_date: string | null;
  status: 'PENDING' | 'PAID' | 'CANCELED';
  notes?: string | null;
  paid_at?: string | null;
  created_at: string;
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
  paid_amount?: number;
  status: 'PENDING' | 'PAID' | 'CANCELED';
};

export type PersonalWalletInvoicePayment = {
  id: string;
  card_id: string;
  due_month: string;
  account_id: string | null;
  amount: number;
  source: 'MANUAL' | 'ACCOUNT';
  created_at: string;
};

export type WalletAccountOperation = {
  id: string;
  operation_type: 'INCOME'|'RECEIPT'|'EXPENSE'|'PAYMENT'|'TRANSFER';
  from_account_id: string|null;
  to_account_id: string|null;
  amount: number;
  description: string;
  category: string;
  operation_date: string;
  created_at: string;
};
export type WalletStatementRow = {
  id: string;
  target_kind: 'ACCOUNT'|'CARD';
  target_id: string;
  document_hash: string;
  row_key: string;
  entry_date: string;
  description: string;
  amount: number;
  category: string;
};
export type RecordWalletOperation = {
  type: WalletAccountOperation['operation_type'];
  fromAccountId: string|null;
  toAccountId: string|null;
  amount: number;
  description: string;
  category: string;
  date: string;
  requestId: string;
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
    const [accounts, cards, expenses, installments, invoicePayments, accountOperations, statementRows, payables] = await Promise.all([
      supabase.from('personal_wallet_accounts').select('*').order('created_at', { ascending: false }),
      supabase.from('personal_wallet_cards').select('*').order('created_at', { ascending: false }),
      supabase.from('personal_wallet_expenses').select('*').order('expense_date', { ascending: false }),
      supabase.from('personal_wallet_expense_installments').select('*').order('due_month', { ascending: true }),
      supabase.from('personal_wallet_invoice_payments').select('id,card_id,due_month,account_id,amount,source,created_at').order('created_at', { ascending: false }),
      supabase.from('personal_wallet_account_operations').select('*').order('operation_date', {ascending:false}).limit(2000),
      supabase.from('personal_wallet_statement_rows').select('*').order('entry_date', {ascending:false}).limit(2000),
      supabase.from('personal_wallet_payables').select('*').order('due_date', { ascending: true, nullsFirst: false }),
    ]);
    const error = accounts.error || cards.error || expenses.error || installments.error || invoicePayments.error || accountOperations.error || statementRows.error || payables.error;
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
      invoicePayments: (invoicePayments.data || []) as PersonalWalletInvoicePayment[],
      accountOperations: (accountOperations.data || []) as WalletAccountOperation[],
      statementRows: (statementRows.data || []) as WalletStatementRow[],
      payables: (payables.data || []) as PersonalWalletPayable[],
    };
  },

  async recordAccountOperation(input: RecordWalletOperation) {
    if (!Number.isFinite(input.amount) || input.amount <= 0 || Math.abs(input.amount * 100 - Math.round(input.amount * 100)) > 0.000001) {
      throw new Error('Valor inválido.');
    }
    const { data, error } = await supabase.rpc('personal_wallet_record_account_operation', {
      p_type: input.type,
      p_from_account: input.fromAccountId,
      p_to_account: input.toAccountId,
      p_amount: input.amount,
      p_description: input.description,
      p_category: input.category,
      p_operation_date: input.date,
      p_request_id: input.requestId,
    });
    if (error) throw new Error(error.message);
    return String(data);
  },

  async recordStatementRow(input: {
    targetKind: 'ACCOUNT'|'CARD';
    targetId: string;
    documentHash: string;
    rowKey: string;
    date: string;
    description: string;
    amount: number;
    category: string;
  }) {
    const { data, error } = await supabase.rpc('personal_wallet_record_statement_row', {
      p_target_kind: input.targetKind,
      p_target_id: input.targetId,
      p_document_hash: input.documentHash,
      p_row_key: input.rowKey,
      p_entry_date: input.date,
      p_description: input.description,
      p_amount: input.amount,
      p_category: input.category,
    });
    if (error) throw new Error(error.message);
    return String(data);
  },

  async createAccount(
    input: Omit<PersonalWalletAccount, 'id' | 'balance' | 'image_url' | 'image_path'> & { balance?: number },
    imageFile?: File | null,
  ) {
    const ownerUserId = await this.ownerId();
    const accountId = generateUUID();
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

  /**
   * Atualiza exclusivamente os metadados da conta. O saldo fica protegido:
   * entradas e saídas continuam sendo registradas pelos fluxos financeiros próprios.
   */
  async updateAccount(
    accountId: string,
    input: Pick<PersonalWalletAccount, 'nickname' | 'bank_name' | 'account_type' | 'pix_key' | 'pix_key_type' | 'notes'>,
    imageFile?: File | null,
  ) {
    const ownerUserId = await this.ownerId();
    const nickname = String(input.nickname || '').trim();
    if (!nickname || nickname.length > 120) throw new Error('Informe um apelido válido de até 120 caracteres.');
    const accountType = String(input.account_type || '').trim().toUpperCase();
    if (!['CHECKING', 'SAVINGS', 'CASH', 'INVESTMENT'].includes(accountType)) {
      throw new Error('Tipo de conta inválido.');
    }
    const pixKeyType = String(input.pix_key_type || '').trim().toUpperCase();
    if (pixKeyType && !['CPF', 'EMAIL', 'PHONE', 'RANDOM'].includes(pixKeyType)) {
      throw new Error('Tipo de chave PIX inválido.');
    }
    const pixKey = String(input.pix_key || '').trim();
    if (pixKeyType && !pixKey) throw new Error('Informe a chave PIX do tipo escolhido.');
    if (!pixKeyType && pixKey) throw new Error('Selecione o tipo da chave PIX.');
    if (pixKey.length > 255) throw new Error('Chave PIX muito longa.');
    const bankName = String(input.bank_name || '').trim();
    const notes = String(input.notes || '').trim();
    if (bankName.length > 120 || notes.length > 2000) throw new Error('Dados da conta excedem o limite permitido.');

    const { data: current, error: loadError } = await supabase
      .from('personal_wallet_accounts')
      .select('id,image_path')
      .eq('id', accountId)
      .eq('owner_user_id', ownerUserId)
      .single();
    if (loadError || !current) throw new Error('Conta não encontrada ou acesso não autorizado.');

    let uploadedPath: string | null = null;
    if (imageFile) {
      const ext = CARD_IMAGE_EXTENSIONS[imageFile.type];
      if (!ext || imageFile.size > MAX_CARD_IMAGE_SIZE) {
        throw new Error('A imagem deve ser JPEG, PNG ou WebP de até 5 MB.');
      }
      uploadedPath = `${ownerUserId}/${accountId}/account-${generateUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from(ACCOUNT_IMAGES_BUCKET)
        .upload(uploadedPath, imageFile, { contentType: imageFile.type, upsert: false });
      if (uploadError) throw new Error('Erro ao enviar a imagem: ' + uploadError.message);
    }

    const changes = {
      nickname,
      bank_name: bankName || null,
      account_type: accountType,
      pix_key_type: pixKeyType || null,
      pix_key: pixKey || null,
      notes: notes || null,
      updated_at: new Date().toISOString(),
      ...(uploadedPath ? { image_path: uploadedPath } : {}),
    };
    const { data, error } = await supabase
      .from('personal_wallet_accounts')
      .update(changes)
      .eq('id', accountId)
      .eq('owner_user_id', ownerUserId)
      .select('id')
      .single();
    if (error || !data) {
      if (uploadedPath) await supabase.storage.from(ACCOUNT_IMAGES_BUCKET).remove([uploadedPath]);
      throw new Error(error?.message || 'Não foi possível salvar a edição.');
    }
    // Remover imagem anterior somente DEPOIS de confirmar a atualização.
    // Falha de limpeza não altera os dados da conta.
    if (uploadedPath && current.image_path && current.image_path !== uploadedPath) {
      await supabase.storage.from(ACCOUNT_IMAGES_BUCKET).remove([current.image_path]).catch(() => {});
    }
  },

  async createCard(
    input: Omit<PersonalWalletCard, 'id' | 'used_limit' | 'current_bill' | 'status' | 'image_url' | 'image_path'> & { used_limit?: number; current_bill?: number; status?: string },
    imageFile?: File | null,
  ) {
    const ownerUserId = await this.ownerId();
    const cardId = generateUUID();
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

  async createPayable(input: Omit<PersonalWalletPayable, 'id' | 'status' | 'paid_at' | 'created_at'>) {
    if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('Informe um valor válido para a dívida.');
    const ownerUserId = await this.ownerId();
    const { data, error } = await supabase.from('personal_wallet_payables').insert({
      ...input,
      owner_user_id: ownerUserId,
      status: 'PENDING',
    }).select().single();
    if (error) throw new Error(error.message);
    return data as PersonalWalletPayable;
  },

  async setPayableStatus(id: string, status: 'PAID' | 'CANCELED') {
    const ownerUserId = await this.ownerId();
    const { error } = await supabase.from('personal_wallet_payables').update({
      status,
      paid_at: status === 'PAID' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('owner_user_id', ownerUserId);
    if (error) throw new Error(error.message);
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

  async payInvoicePartial(cardId: string, dueMonth: string, accountId: string | null, amount: number, requestId: string) {
    if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
      throw new Error('Informe um valor positivo com até duas casas decimais.');
    }
    const { data, error } = await supabase.rpc('personal_wallet_pay_invoice_partial', {
      p_card_id: cardId,
      p_due_month: dueMonth,
      p_account_id: accountId || null,
      p_amount: amount,
      p_request_id: requestId,
    });
    if (error) throw new Error(error.message);
    return Number(data || 0);
  },
};
