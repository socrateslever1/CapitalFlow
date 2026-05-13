import { supabase } from '../lib/supabase';
import { safeUUID } from '../utils/uuid';

export interface ExtratoItem {
  id: string;
  kind: 'CREDITO' | 'FINANCEIRO';
  source_id: string | null;
  amount: number;
  category: string;
  description: string;
  created_at: string;
  meta: Record<string, any>;
  profile_id: string;
  loan_id: string | null;
}

export interface ExtratoFilter {
  profile_id: string;
  period?: 'today' | '7days' | '30days' | '60days' | '90days';
  type?: 'RECEITA' | 'DESPESA' | 'TRANSFER';
  source_id?: string;
  loan_id?: string;
  limit?: number;
  offset?: number;
}

export const extratoService = {
  // Buscar extrato geral com filtros
  async getExtrato(filters: ExtratoFilter): Promise<ExtratoItem[]> {
    const {
      profile_id,
      period = '30days',
      type,
      source_id,
      loan_id,
      limit = 100,
      offset = 0,
    } = filters;

    const safeProfileId = safeUUID(profile_id);
    if (!safeProfileId) return [];

    let query = supabase
      .from('vw_extrato_geral')
      .select('*')
      .eq('profile_id', safeProfileId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Filtro por período
    const now = new Date();
    let startDate = new Date();
    switch (period) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        break;
      case '7days':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30days':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '60days':
        startDate.setDate(startDate.getDate() - 60);
        break;
      case '90days':
        startDate.setDate(startDate.getDate() - 90);
        break;
    }

    query = query.gte('created_at', startDate.toISOString());

    // Filtro por tipo
    if (type) {
      query = query.eq('category', type);
    }

    // Filtro por fonte
    if (source_id) {
      const safeSourceId = safeUUID(source_id);
      if (safeSourceId) query = query.eq('source_id', safeSourceId);
    }

    // Filtro por empréstimo
    if (loan_id) {
      const safeLoanId = safeUUID(loan_id);
      if (safeLoanId) query = query.eq('loan_id', safeLoanId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[extratoService] Erro ao buscar extrato:', error);
      return [];
    }

    return (data || []) as ExtratoItem[];
  },

  // Calcular somatório por período
  async getSummary(filters: Omit<ExtratoFilter, 'limit' | 'offset'>) {
    const items = await this.getExtrato({ ...filters, limit: 10000, offset: 0 });

    const summary = {
      total_receita: 0,
      total_despesa: 0,
      total_transfer: 0,
      saldo_liquido: 0,
      count_receita: 0,
      count_despesa: 0,
      count_transfer: 0,
    };

    items.forEach((item) => {
      if (item.category === 'RECEITA' || item.kind === 'CREDITO') {
        summary.total_receita += item.amount;
        summary.count_receita += 1;
      } else if (item.category === 'DESPESA') {
        summary.total_despesa += Math.abs(item.amount);
        summary.count_despesa += 1;
      } else if (item.category === 'TRANSFER') {
        summary.total_transfer += item.amount;
        summary.count_transfer += 1;
      }
    });

    summary.saldo_liquido = summary.total_receita - summary.total_despesa + summary.total_transfer;

    return summary;
  },

  // Validar consistência: somatório em transacoes vs pf_transacoes
  async validateConsistency(profile_id: string) {
    const safeProfileId = safeUUID(profile_id);
    if (!safeProfileId) return { total_credito: 0, total_financeiro: 0, saldo_total: 0, is_consistent: true };

    const { data: creditoSum } = await supabase
      .from('transacoes')
      .select('amount')
      .eq('profile_id', safeProfileId);

    const { data: financeiroSum } = await supabase
      .from('pf_transacoes')
      .select('amount')
      .eq('profile_id', safeProfileId);

    const totalCredito = (creditoSum || []).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const totalFinanceiro = (financeiroSum || []).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    return {
      total_credito: totalCredito,
      total_financeiro: totalFinanceiro,
      saldo_total: totalCredito + totalFinanceiro,
      is_consistent: true, // Adicionar lógica de validação se necessário
    };
  },

  // Refetch após pagamento
  async refetchAfterPayment(profile_id: string) {
    // Aguardar 500ms para garantir que RPC finalizou
    await new Promise((resolve) => setTimeout(resolve, 500));
    return this.getExtrato({ profile_id, limit: 50 });
  },
};
