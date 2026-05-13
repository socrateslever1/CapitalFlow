import { LoanStatus, Installment } from '../../../../types';
import { addDaysUTC, parseDateOnlyUTC } from '../../../../utils/dateHelpers';
import { generateUUID } from '../../../../utils/generators';

// --- NOVA MODALIDADE: DAILY_FIXED_TERM (PARCELA ÚNICA) ---
export const calculateDailyFixedTermInstallments = (
  principal: number,
  monthlyRate: number,
  startDateStr: string,
  durationDaysStr: string,
  skipWeekends: boolean = false
): { installments: Installment[], totalToReceive: number } => {
    // 1. Definição de Prazos
    const baseDate = parseDateOnlyUTC(startDateStr);
    const durationDays = parseInt(durationDaysStr) || 15; // Default 15 dias se não informado
    
    // 2. Cálculo Financeiro (TAXA FIXA / FLAT FEE)
    // A taxa é aplicada integralmente sobre o principal, independente se são 15, 30 ou 45 dias.
    const totalInterest = principal * (monthlyRate / 100);
    const totalToReceive = principal + totalInterest;
    
    // 3. Definição do Vencimento Único (Fim do Prazo)
    const dueDate = addDaysUTC(baseDate, durationDays, skipWeekends);

    // 4. Geração da Parcela Única
    const installment: Installment = {
        id: generateUUID(),
        dueDate: dueDate.toISOString(),
        
        // Valores Totais do Contrato
        amount: parseFloat(totalToReceive.toFixed(2)),
        scheduledPrincipal: parseFloat(principal.toFixed(2)),
        scheduledInterest: parseFloat(totalInterest.toFixed(2)),
        
        // Saldos Iniciais (Iguais aos totais)
        principalRemaining: parseFloat(principal.toFixed(2)),
        interestRemaining: parseFloat(totalInterest.toFixed(2)),
        
        lateFeeAccrued: 0, 
        avApplied: 0, 
        paidPrincipal: 0, 
        paidInterest: 0, 
        paidLateFee: 0, 
        paidTotal: 0,
        
        status: LoanStatus.PENDING,
        logs: [],
        number: 1 // Sempre 1/1
    };

    return { installments: [installment], totalToReceive };
};

// Novas Modalidades Diárias (Single Installment logic - Diária Livre ou Ciclo 30)
export const calculateNewDailyInstallments = (
  billingCycle: string, 
  principal: number,
  rate: number,
  startDateStr: string,
  fixedDuration: string, 
  existingId?: string,
  skipWeekends: boolean = false
): { installments: Installment[], totalToReceive: number } => {
  const baseDate = parseDateOnlyUTC(startDateStr);
  
  // Para DAILY_FREE, juros não são pré-fixados na parcela inicial
  // Para DAILY_30_INTEREST/CAPITAL, calculamos o juros do primeiro ciclo (30 dias)
  const isCycle30 = billingCycle.includes('DAILY_30');
  
  let scheduledInterest = 0;
  let durationDays = 0; 

  if (isCycle30) {
      // Juros do ciclo = Principal * Taxa Mensal
      scheduledInterest = principal * (rate / 100);
      durationDays = 30; // Primeiro vencimento em 30 dias
  }

  const totalToReceive = principal + scheduledInterest;
  const dueDate = addDaysUTC(baseDate, durationDays, skipWeekends);
  
  const installment: Installment = {
    id: existingId || generateUUID(),
    dueDate: dueDate.toISOString(),
    amount: parseFloat(totalToReceive.toFixed(2)),
    scheduledPrincipal: parseFloat(principal.toFixed(2)),
    scheduledInterest: parseFloat(scheduledInterest.toFixed(2)),
    principalRemaining: parseFloat(principal.toFixed(2)),
    interestRemaining: parseFloat(scheduledInterest.toFixed(2)),
    lateFeeAccrued: 0, 
    avApplied: 0, 
    paidPrincipal: 0, 
    paidInterest: 0, 
    paidLateFee: 0, 
    paidTotal: 0, 
    status: LoanStatus.PENDING, 
    logs: [],
    number: 1
  };

  return { installments: [installment], totalToReceive };
};

// Legacy adapter for compatibility with older code relying on this specific export
export const calculateLegacyDailyInstallments = (
  principal: number,
  rate: number,
  startDateStr: string,
  initialData: any,
  skipWeekends: boolean = false
) => {
    return calculateNewDailyInstallments(
        'DAILY',
        principal,
        rate,
        startDateStr,
        '30',
        initialData?.installments?.[0]?.id,
        skipWeekends
    );
};