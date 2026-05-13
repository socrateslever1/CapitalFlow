// services/maintenance.service.ts
import { supabase } from '../lib/supabase';
import { rebuildLoanStateFromLedger } from '../domain/finance/calculations';
import { Loan } from '../types';

export const maintenanceService = {
  /**
   * Recalcula o estado de todos os empréstimos baseando-se no histórico (ledger).
   * Garante que os saldos de principal, juros e multas nas parcelas estejam corretos.
   */
  async recalculateAllLoans(loans: Loan[]) {
    if (!Array.isArray(loans)) return;

    for (const loan of loans) {
      if (!loan.id) continue;

      // 1. Reconstrói o estado lógico a partir do histórico
      const rebuilt = rebuildLoanStateFromLedger(loan);

      // 2. Atualiza as parcelas no banco de dados para refletir o estado reconstruído
      const updates = rebuilt.installments.map(inst => {
        return supabase
          .from('parcelas')
          .update({
            principal_remaining: inst.principalRemaining,
            interest_remaining: inst.interestRemaining,
            late_fee_accrued: inst.lateFeeAccrued,
            status: inst.status
          })
          .eq('id', inst.id);
      });

      await Promise.all(updates);
    }
  },

  /**
   * Sincroniza o saldo do perfil (Caixa Livre) baseado no lucro total do ledger.
   * Lucro = Soma(interestDelta + lateFeeDelta) - Soma(Withdrawals)
   */
  async syncProfileBalance(profileId: string, loans: Loan[]) {
    if (!profileId) return;

    // 🚀 FILTRO DE SEGURANÇA: Ignora lucros de contratos de "teste"
    const filteredLoans = loans.filter(l => {
      const name = (l.debtorName || '').toLowerCase();
      return !name.includes('teste');
    });

    // Calcula o lucro total realizado de todos os contratos
    let totalProfit = 0;
    filteredLoans.forEach(loan => {
      (loan.ledger || []).forEach(t => {
        // Considera pagamentos e estornos de pagamentos
        if (t.type?.includes('PAYMENT') || t.type === 'ESTORNO' || t.type === 'AGREEMENT_PAYMENT_REVERSED') {
          const profit = (Number(t.interestDelta || 0) + Number(t.lateFeeDelta || 0));
          totalProfit = Math.round((totalProfit + profit) * 100) / 100;
        }
      });
    });

    // Busca os resgates realizados (se houver uma tabela de transações de caixa)
    const { data: withdrawals } = await supabase
      .from('transacoes_caixa')
      .select('valor')
      .eq('profile_id', profileId)
      .eq('tipo', 'WITHDRAWAL');

    const totalWithdrawn = (withdrawals || []).reduce((acc, w) => acc + Number(w.valor || 0), 0);
    
    const finalBalance = Math.max(0, totalProfit - totalWithdrawn);

    // Atualiza o perfil
    await supabase
      .from('perfis')
      .update({ interest_balance: finalBalance })
      .eq('id', profileId);
      
    return finalBalance;
  }
};
