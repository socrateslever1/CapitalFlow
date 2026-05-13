
import { Loan } from '../../types';
import { loanEngine } from '../loanEngine';
import { resolveLoanVisualClassification } from '../../utils/loanFilterResolver';
import { calculateRiskProfile } from '../finance/riskAnalysis';
import { rebuildLoanStateFromLedger, ZERO_BALANCE_THRESHOLD } from '../finance/calculations';

export const buildDashboardStats = (loansRaw: Loan[], sources: any[] = [], activeUser: any = null) => {
  // Reconstroi todos os contratos do ledger para garantir precisão total nos contadores
  const loans = loansRaw.map(l => rebuildLoanStateFromLedger(l));

  // 🚀 FILTRO DE SEGURANÇA: Remove contratos de "teste" da contagem e cálculos
  const filteredLoans = loans.filter(l => {
    const name = (l.debtorName || '').toLowerCase();
    return !name.includes('teste');
  });

  // Classifica todos os empréstimos uma única vez
  const classifiedLoans = filteredLoans.map(l => ({
    loan: l,
    classification: resolveLoanVisualClassification(l),
    riskProfile: calculateRiskProfile(l)
  }));

  // Filtra empréstimos operacionais (Ativos)
  const activeLoans = classifiedLoans.filter(c => 
    ['EM_DIA', 'ATRASADO', 'CRITICO', 'RENEGOCIADO'].includes(c.classification)
  );
  
  // 1. CAPITAL NA RUA & CONTAGEM
  const totalLent = activeLoans.reduce((acc, c) => {
      const loanPrincipalRemaining = loanEngine.computeRemainingBalance(c.loan).principalRemaining;
      if (loanPrincipalRemaining <= ZERO_BALANCE_THRESHOLD) return acc;
      return acc + loanPrincipalRemaining;
  }, 0);

  const activeCount = activeLoans.length;

  // 1.1 RISCO & EXPOSIÇÃO
  const highRiskLoans = activeLoans.filter(c => c.riskProfile.isHighRisk || c.riskProfile.isPotentialDefaulter);
  const totalAtRisk = highRiskLoans.reduce((acc, c) => {
      const remaining = loanEngine.computeRemainingBalance(c.loan).totalRemaining;
      return acc + (remaining > ZERO_BALANCE_THRESHOLD ? remaining : 0);
  }, 0);
  const potentialDefaulterCount = activeLoans.filter(c => c.riskProfile.isPotentialDefaulter).length;


  // 2. TOTAIS GERAIS (Lucro Realizado)
  const totalProfitRealized = filteredLoans.reduce((acc, l) => {
      const profitFromLedger = (l.ledger || []).reduce((sum, t) => {
          if (!String(t.type || '').includes('PAYMENT')) return sum;
          // Soma juros e multas pagos
          return sum + (Number(t.interestDelta || 0) + Number(t.lateFeeDelta || 0));
      }, 0);
      return acc + profitFromLedger;
  }, 0);

  // 3. LUCRO A RECEBER (apenas de ativos)
  const remainingProfit = activeLoans.reduce((acc, c) => {
      const balance = loanEngine.computeRemainingBalance(c.loan);
      const loanInterest = balance.interestRemaining;
      const loanLateFee = balance.lateFeeRemaining;
      const totalRemaining = loanInterest + loanLateFee;
      if (totalRemaining <= ZERO_BALANCE_THRESHOLD) return acc;
      return acc + totalRemaining;
  }, 0);

  // Lucro Projetado Total = O que já ganhou + O que vai ganhar
  const totalProjectedProfit = totalProfitRealized + remainingProfit;

  const roi = totalLent > 0 ? (totalProjectedProfit / totalLent) * 100 : 0;

  // ✅ Unify "Caixa Livre" detection logic (matching useSourceController)
  const normalize = (s: string) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const caixaLivreSources = Array.isArray(sources) ? sources.filter(s => {
    const n = normalize(s.name || '');
    return n.includes('caixa livre') || n.includes('lucro') || n.includes('disponivel') || n.includes('balance');
  }) : [];

  const interestBalanceFromSources = caixaLivreSources.reduce((acc, s) => acc + (Number(s.balance) || 0), 0);
  
  // 🔥 CORREÇÃO CRÍTICA: Prioridade total para as Fontes.
  // Só usamos o interestBalance do perfil se o usuário NÃO tiver nenhuma fonte de "Caixa Livre/Lucro".
  const interestBalance = (caixaLivreSources.length > 0)
    ? interestBalanceFromSources 
    : (Number(activeUser?.interestBalance) || 0);
  
  // Contagens para o gráfico de pizza
  const paidCount = classifiedLoans.filter(c => c.classification === 'QUITADO').length;
  const renegotiatedCount = classifiedLoans.filter(c => c.classification === 'RENEGOCIADO').length;
  const lateCount = classifiedLoans.filter(c => c.classification === 'ATRASADO' || c.classification === 'CRITICO').length;
  const onTimeCount = classifiedLoans.filter(c => c.classification === 'EM_DIA').length;
  
  const pieData = [
      { name: 'Em Dia', value: onTimeCount, color: '#3b82f6' }, 
      { name: 'Atrasados', value: lateCount, color: '#f43f5e' }, 
      { name: 'Quitados', value: paidCount, color: '#10b981' }
  ];
  if (renegotiatedCount > 0) {
      pieData.push({ name: 'Renegociados', value: renegotiatedCount, color: '#f97316' });
  }
  
  const monthlyDataMap: {[key: string]: {name: string, Entradas: number, Saidas: number}} = {};
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  let receivedThisMonth = 0;

  const monthsBack = 5;
  for (let i = monthsBack; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7); 
      const month = d.getMonth() + 1;
      const year = d.getFullYear().toString().slice(-2);
      monthlyDataMap[key] = { name: `${month.toString().padStart(2, '0')}/${year}`, Entradas: 0, Saidas: 0 };
  }
  
  filteredLoans.forEach(l => {
    (l.ledger || []).forEach(t => {
      if (!t.date || t.date.length < 7) return;
      const key = t.date.slice(0, 7);

      if (!monthlyDataMap[key]) return;
      
      if (key === currentMonthKey && t.type?.includes('PAYMENT')) {
          receivedThisMonth += (Number(t.interestDelta || 0) + Number(t.lateFeeDelta || 0));
      }

      if (t.type === 'LEND_MORE' || t.type === 'NEW_LOAN') {
        monthlyDataMap[key].Saidas += t.amount;
      } else if (t.type?.includes('PAYMENT')) {
        monthlyDataMap[key].Entradas += t.amount;
      }
    });
  });
  
  const lineChartData = Object.values(monthlyDataMap).sort((a,b) => {
    const [m1, y1] = a.name.split('/');
    const [m2, y2] = b.name.split('/');
    if (y1 !== y2) return y1.localeCompare(y2);
    return m1.localeCompare(m2);
  });
  
  return { 
      totalLent, 
      activeCount,
      totalReceived: totalProfitRealized, // Agora mostra Lucro Realizado
      receivedThisMonth,
      expectedProfit: totalProjectedProfit, // Agora mostra Lucro Total Projetado (Realizado + A Receber)
      roi,
      interestBalance, 
      pieData, 
      lineChartData,
      totalAtRisk,
      potentialDefaulterCount
  };
};
