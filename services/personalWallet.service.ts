export type WalletRecurringObligation={
 id:string;owner_user_id:string;kind:'EXPENSE'|'DEBT';description:string;creditor_name:string;
 creditor_type:'PERSON'|'COMPANY';category:string;amount:number;due_day:number;
 origin_type:'ACCOUNT'|'CARD';origin_account_id:string|null;origin_card_id:string|null;
 start_month:string;active:boolean;created_at:string;
};
import { supabase } from '../lib/supabase';
import { generateUUID } from '../utils/generators';

const CARD_IMAGES_BUCKET = 'personal-wallet-cards';
const ACCOUNT_IMAGES_BUCKET = 'personal-wallet-accounts';
const PAYABLE_RECEIPTS_BUCKET = 'personal-wallet-payable-receipts';
const MAX_CARD_IMAGE_SIZE = 5 * 1024 * 1024;
const CARD_IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};


export type WalletRecurringIncome={
 id:string;user_id:string;description:string;category:string;amount:number;
 receipt_day:number;destination_account_id:string;active:boolean;created_at:string;
};
export type WalletRecurringReceipt={id:string;income_id:string;reference_month:string;operation_id:string};

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
  institution_key?: string | null;
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
  institution_key?: string | null;
  primary_color?: string | null;
  available_limit?: number;
};

export type PersonalWalletPayable = {
  id: string;
  creditor_name: string;
  creditor_type: 'PERSON' | 'COMPANY';
  description: string;
  amount: number;
  total_amount: number;
  outstanding_balance: number;
  due_date: string | null;
  status: 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELED';
  creditor_document?: string | null;
  category?: string;
  origin_type?: 'ACCOUNT' | 'CARD' | 'CASH' | null;
  origin_account_id?: string | null;
  origin_card_id?: string | null;
  interest_rate: number;
  fine_percent: number;
  proof_path?: string | null;
  notes?: string | null;
  paid_at?: string | null;
  created_at: string;
};

export type PersonalWalletPayablePayment = {
  id: string;
  payable_id: string;
  account_id: string | null;
  card_id?: string | null;
  amount: number;
  proof_path: string | null;
  paid_at: string;
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

export type UpdatePersonalWalletExpense = {
  expenseId: string;
  description: string;
  amount: number;
  category: string;
  expenseDate: string;
  dueDate?: string | null;
  notes?: string | null;
};

export const personalWalletService = {
  async ownerId() {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.id) throw new Error('Sessão não encontrada.');
    return data.user.id;
  },

  async load() {
    const [accounts, cards, expenses, installments, invoicePayments, accountOperations, statementRows, payables, payablePayments, recurringIncomes, recurringReceipts, recurringObligations] = await Promise.all([
      supabase.from('personal_wallet_accounts').select('*').order('created_at', { ascending: false }),
      supabase.from('personal_wallet_cards').select('*').order('created_at', { ascending: false }),
      supabase.from('personal_wallet_expenses').select('*').order('expense_date', { ascending: false }),
      supabase.from('personal_wallet_expense_installments').select('*').order('due_month', { ascending: true }),
      supabase.from('personal_wallet_invoice_payments').select('id,card_id,due_month,account_id,amount,source,created_at').order('created_at', { ascending: false }),
      supabase.from('personal_wallet_account_operations').select('*').order('operation_date', {ascending:false}).limit(2000),
      supabase.from('personal_wallet_statement_rows').select('*').order('entry_date', {ascending:false}).limit(2000),
      supabase.from('personal_wallet_payables').select('*').order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('personal_wallet_payable_payments').select('id,payable_id,account_id,card_id,amount,proof_path,paid_at').order('paid_at', { ascending: false }),
      supabase.from('personal_wallet_recurring_incomes').select('*').order('receipt_day',{ascending:true}),
      supabase.from('personal_wallet_recurring_receipts').select('id,income_id,reference_month,operation_id').order('reference_month',{ascending:false}).limit(500),
      supabase.from('personal_wallet_recurring_obligations').select('*').order('created_at',{ascending:false}),
    ]);
    const error = accounts.error || cards.error || expenses.error || installments.error || invoicePayments.error || accountOperations.error || statementRows.error || payables.error || payablePayments.error || recurringIncomes.error || recurringReceipts.error || recurringObligations.error;
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
      payablePayments: (payablePayments.data || []) as PersonalWalletPayablePayment[],
      recurringIncomes: (recurringIncomes.data || []) as WalletRecurringIncome[],
      recurringReceipts: (recurringReceipts.data || []) as WalletRecurringReceipt[],
      recurringObligations: (recurringObligations.data || []) as WalletRecurringObligation[],
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

  async updateCardMetadata(cardId: string, input: {
    nickname: string; issuer: string; brand: string; account_id: string | null;
    credit_limit: number; closing_day: number | null; due_day: number | null;
    status: 'ACTIVE' | 'BLOCKED' | 'CANCELED';
    primary_color?:string|null;
  }) {
    const { error } = await supabase.rpc('personal_wallet_update_card_metadata', {
      p_card_id: cardId, p_nickname: input.nickname, p_issuer: input.issuer,
      p_brand: input.brand, p_account_id: input.account_id,
      p_limit: input.credit_limit, p_closing_day: input.closing_day,
      p_due_day: input.due_day, p_status: input.status,
      p_primary_color: input.primary_color || null,
    });
    if (error) throw new Error(error.message);
  },


  async createRecurringObligation(input:{
    kind:'EXPENSE'|'DEBT';description:string;creditor_name:string;creditor_type:'PERSON'|'COMPANY';
    category:string;amount:number;due_day:number;origin_type:'ACCOUNT'|'CARD';origin_id:string;start_month:string;
  }) {
    const {data,error}=await supabase.rpc('personal_wallet_create_recurring_obligation',{
      p_kind:input.kind,p_description:input.description,p_creditor:input.creditor_name,
      p_creditor_type:input.creditor_type,p_category:input.category,p_amount:input.amount,
      p_due_day:input.due_day,p_origin_type:input.origin_type,p_origin_id:input.origin_id,
      p_start_month:input.start_month
    });
    if(error)throw new Error(error.message);
    return String(data);
  },
  async generateRecurringObligations(month:string,months=3):Promise<number> {
    const {data,error}=await supabase.rpc('personal_wallet_generate_recurring_obligations',{
      p_month:month,p_months:months
    });
    if(error)throw new Error(error.message);
    return Number(data||0);
  },
  async setRecurringObligationActive(id:string,active:boolean) {
    const {error}=await supabase.rpc('personal_wallet_set_recurring_obligation_active',{
      p_id:id,p_active:active
    });
    if(error)throw new Error(error.message);
  },

  async createHybridAssets(input: {
    account?: {nickname:string;bank_name:string;balance:number;account_type:string;pix_key:string|null;pix_key_type:string|null}|null;
    card?: {nickname:string;issuer:string;brand:string|null;last_four:string|null;credit_limit:number;closing_day:number|null;due_day:number|null;primary_color?:string|null}|null;
    existingAccountId?:string|null;
  }) {
    const {data,error}=await supabase.rpc('personal_wallet_create_linked_assets',{
      p_account:input.account||null,p_card:input.card||null,
      p_existing_account_id:input.existingAccountId||null
    });
    if(error)throw new Error(error.message);
    return data as {account_id:string|null;card_id:string|null};
  },

  async createRecurringIncome(input:{description:string;category:string;amount:number;receipt_day:number;destination_account_id:string}) {
    const owner_user_id=await this.ownerId();
    if(!Number.isFinite(input.amount)||input.amount<=0||!Number.isInteger(input.receipt_day)||input.receipt_day<1||input.receipt_day>31)throw new Error('Dados inválidos.');
    const {error}=await supabase.from('personal_wallet_recurring_incomes').insert({
      user_id:owner_user_id,description:input.description.trim(),category:input.category.trim(),
      amount:input.amount,receipt_day:input.receipt_day,destination_account_id:input.destination_account_id
    });
    if(error)throw new Error(error.message);
  },
  async postRecurringIncome(id:string,month:string,requestId:string) {
    const {error}=await supabase.rpc('personal_wallet_post_recurring_income',{
      p_income_id:id,p_month:month,p_request_id:requestId
    });
    if(error)throw new Error(error.message);
  },
  async deactivateRecurringIncome(id:string) {
    const owner_user_id=await this.ownerId();
    const {error}=await supabase.from('personal_wallet_recurring_incomes').update({active:false})
      .eq('id',id).eq('user_id',owner_user_id);
    if(error)throw new Error(error.message);
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

  async createPayable(input: { creditor_name: string; creditor_type: 'PERSON' | 'COMPANY'; creditor_document?: string | null; description: string; category?:string; origin_type?:'ACCOUNT'|'CARD'|'CASH'; origin_account_id?:string|null; origin_card_id?:string|null; total_amount: number; due_date?: string | null; interest_rate?: number; fine_percent?: number; notes?: string | null }) {
    if (!Number.isFinite(input.total_amount) || input.total_amount <= 0) throw new Error('Informe um valor válido para a dívida.');
    const document = String(input.creditor_document || '').replace(/\D/g, '');
    if (document && ![11, 14].includes(document.length)) throw new Error('Informe um CPF ou CNPJ válido.');
    const ownerUserId = await this.ownerId();
    const { data, error } = await supabase.from('personal_wallet_payables').insert({
      ...input,
      creditor_document: document || null,
      amount: input.total_amount,
      outstanding_balance: input.total_amount,
      owner_user_id: ownerUserId,
      status: 'PENDING',
    }).select().single();
    if (error) throw new Error(error.message);
    return data as PersonalWalletPayable;
  },

  async payPayable(input: { payableId: string; accountId: string | null; cardId?: string | null; amount: number; requestId: string; receipt?: File | null }) {
    const ownerUserId = await this.ownerId();
    if (!Number.isFinite(input.amount) || input.amount <= 0 || Math.abs(input.amount * 100 - Math.round(input.amount * 100)) > 0.000001) throw new Error('Informe um valor positivo com até duas casas decimais.');
    let proofPath: string | null = null;
    if (input.receipt) {
      const allowed: Record<string, string> = { ...CARD_IMAGE_EXTENSIONS, 'application/pdf': 'pdf' };
      const extension = allowed[input.receipt.type];
      if (!extension || input.receipt.size > 10 * 1024 * 1024) throw new Error('Use comprovante PDF, JPEG, PNG ou WebP de até 10 MB.');
      proofPath = `${ownerUserId}/${input.payableId}/${input.requestId}.${extension}`;
      const uploaded = await supabase.storage.from(PAYABLE_RECEIPTS_BUCKET).upload(proofPath, input.receipt, { contentType: input.receipt.type, upsert: false });
      if (uploaded.error && !/already exists|duplicate|conflict/i.test(uploaded.error.message)) throw new Error(`Falha ao enviar comprovante: ${uploaded.error.message}`);
    }
    if (input.accountId && input.cardId) throw new Error('Selecione apenas uma origem de fundos.');
    const {data,error}=input.cardId
      ? await supabase.rpc('personal_wallet_pay_payable_from_card', {
          p_payable_id: input.payableId,p_card_id:input.cardId,p_amount:input.amount,
          p_request_id:input.requestId,p_proof_path:proofPath
        })
      : await supabase.rpc('personal_wallet_pay_payable', {
          p_payable_id:input.payableId,p_amount:input.amount,
          p_account_id:input.accountId,p_proof_path:proofPath,p_request_id:input.requestId
        });
    if (error) {
      if (proofPath) await supabase.storage.from(PAYABLE_RECEIPTS_BUCKET).remove([proofPath]);
      throw new Error(error.message);
    }
    return data as { outstanding_balance: number; idempotent: boolean };
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

  async updateExpense(input: UpdatePersonalWalletExpense) {
    if (!input.description.trim()) throw new Error('Informe a descrição do lançamento.');
    if (!Number.isFinite(input.amount) || input.amount <= 0 || Math.abs(input.amount * 100 - Math.round(input.amount * 100)) > 0.000001) {
      throw new Error('Informe um valor positivo com até duas casas decimais.');
    }
    const { error } = await supabase.rpc('personal_wallet_update_expense', {
      p_expense_id: input.expenseId,
      p_description: input.description.trim(),
      p_amount: input.amount,
      p_category: input.category.trim() || 'Outros',
      p_expense_date: input.expenseDate,
      p_due_date: input.dueDate || null,
      p_notes: input.notes?.trim() || null,
    });
    if (error) throw new Error(error.message);
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
