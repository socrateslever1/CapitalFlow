export type WalletCardOpeningPayload = {
  used_limit: number;
  invoice_amount: number;
  future_amount: number;
  future_months: number;
  invoice_month: string;
};

export type WalletRecurringObligation={
 id:string;owner_user_id:string;kind:'EXPENSE'|'DEBT';description:string;creditor_name:string;
 creditor_type:'PERSON'|'COMPANY';category:string;amount:number;due_day:number;
 origin_type:'ACCOUNT'|'CARD';origin_account_id:string|null;origin_card_id:string|null;
 start_month:string;active:boolean;created_at:string;
};
import { supabase } from '../lib/supabase';
import { generateUUID } from '../utils/generators';
import type { CapitalSource } from '../types';

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
  capital_source_id?: string | null;
  archived_at?: string | null;
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
  opening_unallocated_amount?: number;
  initial_future_installments_balance?: number;
  initial_balance_occurred_at?: string | null;
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
  entry_type?: 'PURCHASE' | 'INVOICE_OVERRIDE';
  invoice_due_month?: string | null;
  request_id?: string | null;
  mutation_requests?: Record<string, unknown>;
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
  request_id: string;
  card_id: string;
  due_month: string;
  account_id: string | null;
  amount: number;
  source: 'MANUAL' | 'ACCOUNT';
  created_at: string;
};

export type WalletAccountOperation = {
  id: string;
  request_id: string;
  operation_type: 'INCOME'|'RECEIPT'|'EXPENSE'|'PAYMENT'|'TRANSFER'|'EXTERNAL_TRANSFER'|'LOAN_DISBURSEMENT'|'LOAN_REPAYMENT';
  from_account_id: string|null;
  to_account_id: string|null;
  amount: number;
  description: string;
  category: string;
  operation_date: string;
  recipient_name?: string|null;
  pix_key?: string|null;
  external_identifier?: string|null;
  occurred_at?: string|null;
  charge_id?: string|null;
  contract_id?: string|null;
  installment_id?: string|null;
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
export type PersonalWalletCharge = {
  id: string;
  owner_user_id: string;
  account_id: string;
  provider: 'STATIC_PIX';
  status: 'PENDING'|'PAID';
  amount: number;
  currency: 'BRL';
  description: string;
  create_request_id: string;
  settled_request_id?: string|null;
  settled_amount?: number|null;
  settlement_occurred_at?: string|null;
  paid_at?: string|null;
  created_at: string;
};
export type RecordWalletOperation = {
  type: Exclude<WalletAccountOperation['operation_type'], 'EXTERNAL_TRANSFER'>;
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
    const [accounts, cards, expenses, installments, invoicePayments, accountOperations, statementRows, payables, payablePayments, recurringIncomes, recurringReceipts, recurringObligations, capitalSources] = await Promise.all([
      supabase.from('personal_wallet_accounts').select('*').order('created_at', { ascending: false }),
      supabase.from('personal_wallet_cards').select('*').order('created_at', { ascending: false }),
      supabase.from('personal_wallet_expenses').select('*').order('expense_date', { ascending: false }),
      supabase.from('personal_wallet_expense_installments').select('*').order('due_month', { ascending: true }),
      supabase.from('personal_wallet_invoice_payments').select('id,request_id,card_id,due_month,account_id,amount,source,created_at').order('created_at', { ascending: false }),
      supabase.from('personal_wallet_account_operations').select('*').order('operation_date', {ascending:false}).limit(2000),
      supabase.from('personal_wallet_statement_rows').select('*').order('entry_date', {ascending:false}).limit(2000),
      supabase.from('personal_wallet_payables').select('*').order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('personal_wallet_payable_payments').select('id,payable_id,account_id,card_id,amount,proof_path,paid_at').order('paid_at', { ascending: false }),
      supabase.from('personal_wallet_recurring_incomes').select('*').order('receipt_day',{ascending:true}),
      supabase.from('personal_wallet_recurring_receipts').select('id,income_id,reference_month,operation_id').order('reference_month',{ascending:false}).limit(500),
      supabase.from('personal_wallet_recurring_obligations').select('*').order('created_at',{ascending:false}),
      supabase.from('fontes').select('id,profile_id,name,balance,type').is('archived_at', null).order('name', { ascending: true }),
    ]);
    const error = accounts.error || cards.error || expenses.error || installments.error || invoicePayments.error || accountOperations.error || statementRows.error || payables.error || payablePayments.error || recurringIncomes.error || recurringReceipts.error || recurringObligations.error || capitalSources.error;
    if (error) throw new Error(error.message);
    const loadedExpenses = (expenses.data || []) as PersonalWalletExpense[];
    const loadedInstallments = (installments.data || []) as PersonalWalletExpenseInstallment[];
    const cardsWithImages = await Promise.all(((cards.data || []) as PersonalWalletCard[]).map(async (rawCard) => {
      const initialFuture = Math.max(
        Number(rawCard.initial_future_installments_balance || 0),
        Number(rawCard.opening_unallocated_amount || 0),
      );
      const effectiveUsed = Math.max(Number(rawCard.used_limit || 0), initialFuture);
      const availableLimit = Math.max(0, Math.round((Number(rawCard.credit_limit || 0) - effectiveUsed) * 100) / 100);
      const card: PersonalWalletCard = {
        ...rawCard,
        initial_future_installments_balance: initialFuture,
        opening_unallocated_amount: initialFuture,
        used_limit: effectiveUsed,
        available_limit: availableLimit,
      };
      if (!card.image_path) return card;
      const signed = await supabase.storage.from(CARD_IMAGES_BUCKET).createSignedUrl(card.image_path, 3600);
      return { ...card, image_url: signed.data?.signedUrl || null };
    }));
    const activeAccounts = ((accounts.data || []) as PersonalWalletAccount[]).filter(account => !account.archived_at);
    const accountsWithImages = await Promise.all(activeAccounts.map(async (account) => {
      if (!account.image_path) return account;
      const signed = await supabase.storage.from(ACCOUNT_IMAGES_BUCKET).createSignedUrl(account.image_path, 3600);
      return { ...account, image_url: signed.data?.signedUrl || null };
    }));
    return {
      accounts: accountsWithImages,
      cards: cardsWithImages,
      expenses: loadedExpenses,
      installments: loadedInstallments,
      invoicePayments: (invoicePayments.data || []) as PersonalWalletInvoicePayment[],
      accountOperations: (accountOperations.data || []) as WalletAccountOperation[],
      statementRows: (statementRows.data || []) as WalletStatementRow[],
      payables: (payables.data || []) as PersonalWalletPayable[],
      payablePayments: (payablePayments.data || []) as PersonalWalletPayablePayment[],
      recurringIncomes: (recurringIncomes.data || []) as WalletRecurringIncome[],
      recurringReceipts: (recurringReceipts.data || []) as WalletRecurringReceipt[],
      recurringObligations: (recurringObligations.data || []) as WalletRecurringObligation[],
      capitalSources: (capitalSources.data || []) as CapitalSource[],
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

  async recordExternalTransfer(input: {
    accountId: string;
    amount: number;
    occurredAt: string;
    recipientName: string;
    pixKey?: string | null;
    externalIdentifier?: string | null;
    description: string;
    requestId: string;
  }) {
    if (!Number.isFinite(input.amount) || input.amount <= 0 || Math.abs(input.amount * 100 - Math.round(input.amount * 100)) > 0.000001) {
      throw new Error('Informe um valor positivo com até duas casas decimais.');
    }
    const { data, error } = await supabase.rpc('personal_wallet_record_external_transfer', {
      p_account_id: input.accountId,
      p_amount: input.amount,
      p_occurred_at: input.occurredAt,
      p_recipient_name: input.recipientName.trim(),
      p_pix_key: input.pixKey?.trim() || null,
      p_external_identifier: input.externalIdentifier?.trim() || null,
      p_description: input.description.trim(),
      p_request_id: input.requestId,
    });
    if (error) throw new Error(error.message);
    return String(data);
  },

  async linkCapitalSource(accountId: string, capitalSourceId: string | null) {
    const { data, error } = await supabase.rpc('personal_wallet_link_capital_source', {
      p_account_id: accountId,
      p_capital_source_id: capitalSourceId || null,
    });
    if (error) throw new Error(error.message);
    return Boolean(data);
  },

  async initializeAccountOpening(input: {
    accountId: string;
    amount: number;
    occurredAt: string;
    requestId: string;
  }) {
    if (!Number.isFinite(input.amount) || input.amount <= 0 || Math.abs(input.amount * 100 - Math.round(input.amount * 100)) > 0.000001) {
      throw new Error('Informe um saldo inicial positivo com até duas casas decimais.');
    }
    const { data, error } = await supabase.rpc('personal_wallet_initialize_account_opening', {
      p_account_id: input.accountId,
      p_amount: input.amount,
      p_occurred_at: input.occurredAt,
      p_request_id: input.requestId,
    });
    if (error) throw new Error(error.message);
    return String(data);
  },

  async createWalletCharge(input: {
    accountId: string;
    amount: number;
    description: string;
    requestId: string;
  }) {
    if (!Number.isFinite(input.amount) || input.amount <= 0 || Math.abs(input.amount * 100 - Math.round(input.amount * 100)) > 0.000001) {
      throw new Error('Informe um valor positivo com até duas casas decimais.');
    }
    const description = input.description.trim();
    if (!description || description.length > 240) throw new Error('Informe uma descrição de até 240 caracteres.');
    const { data, error } = await supabase.rpc('personal_wallet_create_charge', {
      p_account_id: input.accountId,
      p_amount: input.amount,
      p_description: description,
      p_request_id: input.requestId,
    });
    if (error) throw new Error(error.message);
    return String(data);
  },

  async settleWalletCharge(input: {
    chargeId: string;
    accountId: string;
    amount: number;
    occurredAt: string;
    requestId: string;
  }) {
    if (!Number.isFinite(input.amount) || input.amount <= 0 || Math.abs(input.amount * 100 - Math.round(input.amount * 100)) > 0.000001) {
      throw new Error('Valor de liquidação inválido.');
    }
    const { data, error } = await supabase.rpc('personal_wallet_settle_charge', {
      p_charge_id: input.chargeId,
      p_account_id: input.accountId,
      p_amount: input.amount,
      p_occurred_at: input.occurredAt,
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

  /** Creates card metadata and its documented opening position atomically in PostgreSQL. */
  async createCardWithOpening(input: {
    card: {
      nickname: string; issuer: string; brand: string | null; last_four: string | null;
      credit_limit: number; closing_day: number | null; due_day: number | null;
      primary_color?: string | null;
    };
    existingAccountId: string | null;
    opening: WalletCardOpeningPayload;
    requestId: string;
  }) {
    const { data, error } = await supabase.rpc('personal_wallet_create_card_with_opening', {
      p_card: input.card,
      p_existing_account_id: input.existingAccountId,
      p_opening: input.opening,
      p_request_id: input.requestId,
    });
    if (error) throw new Error(error.message);
    return data as { account_id: string | null; card_id: string; replayed: boolean };
  },

  /** Imports balances only if the existing card has no financial history. */
  async initializeCardOpening(cardId: string, opening: WalletCardOpeningPayload) {
    const { data, error } = await supabase.rpc('personal_wallet_initialize_card_opening', {
      p_card_id: cardId,
      p_used_limit: opening.used_limit,
      p_invoice_amount: opening.invoice_amount,
      p_future_amount: opening.future_amount,
      p_future_months: opening.future_months,
      p_invoice_month: opening.invoice_month,
    });
    if (error) throw new Error(error.message);
    return data as { card_id: string; used_limit: number; current_bill: number; available_limit: number };
  },

  async reconcileCardOpening(cardId: string, amount: number, requestId: string) {
    const { data, error } = await supabase.rpc('personal_wallet_reconcile_card_opening', {
      p_card_id: cardId, p_amount: amount, p_request_id: requestId,
    });
    if (error) throw new Error(error.message);
    return data as { replayed: boolean; remaining: number };
  },

  async setCardInitialBalances(input: {
    cardId: string;
    creditLimit: number;
    currentInvoice: number;
    futureCommitments: number;
    dueMonth: string;
    requestId: string;
  }) {
    if (!input.cardId || !input.dueMonth || !input.requestId) {
      throw new Error('Dados obrigatórios da carga inicial do cartão ausentes.');
    }
    if (!Number.isFinite(input.creditLimit) || input.creditLimit < 0) {
      throw new Error('Informe um limite total válido.');
    }
    if (!Number.isFinite(input.currentInvoice) || input.currentInvoice < 0) {
      throw new Error('Informe um valor válido para a fatura atual.');
    }
    if (!Number.isFinite(input.futureCommitments) || input.futureCommitments < 0) {
      throw new Error('Informe um valor válido para os compromissos futuros.');
    }
    if (Math.round((input.currentInvoice + input.futureCommitments) * 100) > Math.round(input.creditLimit * 100)) {
      throw new Error('A soma da fatura atual com os compromissos futuros não pode superar o limite total.');
    }
    const normalizedDueMonth = input.dueMonth.length === 7 ? `${input.dueMonth}-01` : input.dueMonth;
    const { data, error } = await supabase.rpc('personal_wallet_set_card_initial_balances', {
      p_card_id: input.cardId,
      p_credit_limit: input.creditLimit,
      p_current_invoice: input.currentInvoice,
      p_future_commitments: input.futureCommitments,
      p_due_month: normalizedDueMonth,
      p_request_id: input.requestId,
    });
    if (error) throw new Error(error.message);
    return data as {
      card_id: string;
      due_month: string | null;
      current_invoice: number;
      initial_future_installments_balance: number;
      future_commitments: number;
      committed_limit: number;
      free_limit: number;
      available_limit: number;
      replayed: boolean;
    };
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
      .insert({
        ...input,
        capital_source_id: null,
        balance: 0,
        id: accountId,
        owner_user_id: ownerUserId,
        image_path: imagePath
      })
      .select()
      .single();
    if (error) {
      if (imagePath) await supabase.storage.from(ACCOUNT_IMAGES_BUCKET).remove([imagePath]);
      throw new Error(error.message);
    }
    const initialBalance = Math.round(Number(input.balance || 0) * 100) / 100;
    if (initialBalance > 0) {
      await this.initializeAccountOpening({
        accountId,
        amount: initialBalance,
        occurredAt: new Date().toISOString(),
        requestId: generateUUID(),
      });
    }
    if (input.capital_source_id) await this.linkCapitalSource(accountId, input.capital_source_id);
    return {
      ...(data as PersonalWalletAccount),
      balance: initialBalance > 0 ? initialBalance : 0,
      capital_source_id: input.capital_source_id || null,
    };
  },

  /**
   * Atualiza exclusivamente os metadados da conta. O saldo fica protegido:
   * entradas e saídas continuam sendo registradas pelos fluxos financeiros próprios.
   */
  async updateAccount(
    accountId: string,
    input: Pick<PersonalWalletAccount, 'nickname' | 'bank_name' | 'account_type' | 'pix_key' | 'pix_key_type' | 'notes'> & { capital_source_id?: string | null },
    imageFile?: File | null,
  ) {
    const ownerUserId = await this.ownerId();
    const nickname = String(input.nickname || '').trim();
    if (!nickname || nickname.length > 120) throw new Error('Informe um apelido válido de até 120 caracteres.');
    const accountType = String(input.account_type || '').trim().toUpperCase();
    if (!['CHECKING', 'PAYMENT', 'SAVINGS', 'CASH', 'INVESTMENT'].includes(accountType)) {
      throw new Error('Tipo de conta inválido.');
    }
    const pixKeyType = String(input.pix_key_type || '').trim().toUpperCase();
    if (pixKeyType && !['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM'].includes(pixKeyType)) {
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
    if (input.capital_source_id !== undefined) await this.linkCapitalSource(accountId, input.capital_source_id || null);
  },

  async archiveAccount(accountId: string, requestId = generateUUID()) {
    if (!accountId || !requestId) throw new Error('Conta ou identificador da solicitacao ausente.');
    const { error } = await supabase.rpc('personal_wallet_archive_account', {
      p_account_id: accountId,
      p_request_id: requestId,
    });
    if (error) throw new Error(error.message);
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

  async archiveCard(cardId: string, requestId = generateUUID()) {
    if (!cardId || !requestId) throw new Error('Cartao ou identificador da solicitacao ausente.');
    const { error } = await supabase.rpc('personal_wallet_archive_card', {
      p_card_id: cardId,
      p_request_id: requestId,
    });
    if (error) throw new Error(error.message);
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

  async setMonthlyInvoiceOverride(input: {
    cardId: string;
    dueMonth: string;
    amount: number;
    requestId: string;
  }) {
    if (!input.cardId || !input.dueMonth || !input.requestId) throw new Error('Dados obrigatórios da fatura ausentes.');
    if (!Number.isFinite(input.amount) || input.amount <= 0 || Math.abs(input.amount * 100 - Math.round(input.amount * 100)) > 0.000001) {
      throw new Error('Informe um valor positivo com até duas casas decimais.');
    }
    const { data, error } = await supabase.rpc('personal_wallet_set_monthly_invoice_override', {
      p_card_id: input.cardId,
      p_due_month: input.dueMonth,
      p_amount: input.amount,
      p_request_id: input.requestId,
    });
    if (error) throw new Error(error.message);
    return data as { card_id: string; expense_id: string; due_month: string | null; current_invoice: number; future_commitments: number; committed_limit: number; free_limit: number; replayed: boolean };
  },

  async updateExpense(input: UpdatePersonalWalletExpense, requestId = generateUUID()) {
    if (!input.description.trim()) throw new Error('Informe a descrição do lançamento.');
    if (!Number.isFinite(input.amount) || input.amount <= 0 || Math.abs(input.amount * 100 - Math.round(input.amount * 100)) > 0.000001) {
      throw new Error('Informe um valor positivo com até duas casas decimais.');
    }
    const { error } = await supabase.rpc('personal_wallet_update_expense_idempotent', {
      p_expense_id: input.expenseId,
      p_description: input.description.trim(),
      p_amount: input.amount,
      p_category: input.category.trim() || 'Outros',
      p_expense_date: input.expenseDate,
      p_due_date: input.dueDate || null,
      p_notes: input.notes?.trim() || null,
      p_request_id: requestId,
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

  async cancelExpense(expenseId: string, requestId = generateUUID()) {
    if (!expenseId || !requestId) throw new Error('Identificador do lançamento ausente.');
    const { data, error } = await supabase.rpc('personal_wallet_cancel_expense_idempotent', {
      p_expense_id: expenseId,
      p_request_id: requestId,
    });
    if (error) throw new Error(error.message);
    return data as { card_id: string; due_month: string | null; current_invoice: number; future_commitments: number; committed_limit: number; free_limit: number; replayed: boolean };
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
