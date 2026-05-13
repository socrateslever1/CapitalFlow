import { supabase } from '../../../lib/supabase';
import { generateUUID } from '../../../utils/generators';
import { PFTransaction, PFAccount, PFCard, PFCategory } from '../types';
import { isUUID, safeUUID } from '../../../utils/uuid';

export const personalFinanceService = {

  async getAccounts(profileId: string): Promise<PFAccount[]> {
    const safeProfileId = safeUUID(profileId);
    if (!safeProfileId) return [];

    const { data, error } = await supabase
      .from('pf_contas')
      .select('*')
      .eq('profile_id', safeProfileId);

    if (error) throw error;
    return data || [];
  },

  async getCards(profileId: string): Promise<PFCard[]> {
    const safeProfileId = safeUUID(profileId);
    if (!safeProfileId) return [];

    const { data, error } = await supabase
      .from('pf_cartoes')
      .select('*')
      .eq('profile_id', safeProfileId);

    if (error) throw error;
    return data || [];
  },

  async getCategories(profileId: string): Promise<PFCategory[]> {
    const safeProfileId = safeUUID(profileId);
    if (!safeProfileId) return [];

    const { data, error } = await supabase
      .from('pf_categorias')
      .select('*')
      .eq('profile_id', safeProfileId);

    if (error) throw error;
    return data || [];
  },

  async getTransactions(profileId: string, month: number, year: number): Promise<PFTransaction[]> {
    const safeProfileId = safeUUID(profileId);
    if (!safeProfileId) return [];

    const startDate = new Date(year, month, 1).toISOString();
    const endDate = new Date(year, month + 1, 0).toISOString();

    const { data, error } = await supabase
      .from('pf_transacoes')
      .select(`
        *,
        pf_categorias(nome),
        pf_contas(nome),
        pf_cartoes(nome)
      `)
      .eq('profile_id', safeProfileId)
      .gte('data', startDate)
      .lte('data', endDate)
      .order('data', { ascending: false });

    if (error) throw error;

    return (data || []).map((t: any) => ({
      ...t,
      category_name: t.pf_categorias?.nome,
      account_name: t.pf_contas?.nome,
      card_name: t.pf_cartoes?.nome
    }));
  },

  /**
   * Criação Atômica de Transação Financeira
   * Tudo acontece dentro da RPC:
   * - Insere pf_transacoes
   * - Ajusta saldo da conta
   * - Injeta na operação se necessário
   */
  async addTransaction(tx: any, profileId: string) {

    if (!profileId) throw new Error('profileId obrigatório');
    if (!tx.valor || Number(tx.valor) <= 0) throw new Error('Valor inválido');

    const idempotencyKey = crypto.randomUUID();

    const { error } = await supabase.rpc(
      'pf_create_transaction_atomic',
      {
        p_profile_id: safeUUID(profileId),
        p_valor: Number(tx.valor),
        p_tipo: tx.tipo,
        p_descricao: tx.descricao,
        p_data: tx.data,
        p_status: tx.status || 'CONSOLIDADO',
        p_categoria_id: safeUUID(tx.categoria_id),
        p_conta_id: safeUUID(tx.conta_id),
        p_cartao_id: safeUUID(tx.cartao_id),
        p_is_operation_transfer: !!tx.is_operation_transfer,
        p_operation_loan_id: safeUUID(tx.operation_loan_id),
        p_operation_source_id: safeUUID(tx.operation_source_id),
        p_idempotency_key: idempotencyKey
      }
    );

    if (error) throw error;

    return { success: true };
  },

  async addAccount(acc: Partial<PFAccount>, profileId: string) {
    const { error } = await supabase
      .from('pf_contas')
      .insert({
        id: generateUUID(),
        profile_id: profileId,
        ...acc
      });

    if (error) throw error;
  },

  async deleteAccount(id: string) {
    const safeId = safeUUID(id);
    if (!safeId) return;

    const { error } = await supabase
      .from('pf_contas')
      .delete()
      .eq('id', safeId);

    if (error) throw error;
  },

  async addCard(card: Partial<PFCard>, profileId: string) {
    const { error } = await supabase
      .from('pf_cartoes')
      .insert({
        id: generateUUID(),
        profile_id: profileId,
        ...card
      });

    if (error) throw error;
  },

  async deleteCard(id: string) {
    const safeId = safeUUID(id);
    if (!safeId) return;

    const { error } = await supabase
      .from('pf_cartoes')
      .delete()
      .eq('id', safeId);

    if (error) throw error;
  },

  async addCategory(cat: Partial<PFCategory>, profileId: string) {
    const { error } = await supabase
      .from('pf_categorias')
      .insert({
        id: generateUUID(),
        profile_id: profileId,
        ...cat
      });

    if (error) throw error;
  },

  async transferToLoanWallet(payload: {
    profileId: string;
    loanId: string;
    amount: number;
    description: string;
    transferGroupId?: string;
  }) {
    const { profileId, loanId, amount, description, transferGroupId } = payload;

    const { error: opErr } = await supabase.rpc("pf_transfer_to_operation", {
      p_profile_id: safeUUID(profileId),
      p_loan_id: safeUUID(loanId),
      p_amount: amount,
      p_description: description,
      p_transfer_group_id: transferGroupId || crypto.randomUUID()
    });
    if (opErr) throw opErr;
  },

  async deleteTransaction(id: string) {
    const safeId = safeUUID(id);
    if (!safeId) return;

    const { error } = await supabase
      .from('pf_transacoes')
      .delete()
      .eq('id', safeId);

    if (error) throw error;
  }

};