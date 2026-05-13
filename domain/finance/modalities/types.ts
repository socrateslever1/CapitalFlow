
import { Loan, Installment, LoanPolicy, LoanBillingModality } from "../../../types";

// Tipos de Cálculo existentes
export interface CalculationResult {
    total: number;
    principal: number;
    interest: number;
    lateFee: number;
    baseForFine: number;
    daysLate: number;
    // Novos campos para detalhamento preciso
    finePart?: number; // Valor puro da Multa Fixa
    moraPart?: number; // Valor puro dos Juros de Mora
}

export interface RenewalResult {
    newStartDateISO: string;
    newDueDateISO: string;
    newPrincipalRemaining: number;
    newInterestRemaining: number;
    newScheduledPrincipal: number;
    newScheduledInterest: number;
    newAmount: number;
}

export interface PaymentAllocation {
    paidPrincipal: number;
    paidInterest: number;
    paidLateFee: number;
    avGenerated: number;
}

export interface InstallmentGenerationParams {
    principal: number;
    rate: number;
    startDate: string;
    fixedDuration?: string; // Para Daily Fixed
    initialData?: any; // Para migrações/edições que preservam IDs
}

export interface InstallmentGenerationResult {
    installments: Installment[];
    totalToReceive: number;
}

// Configuração Visual do Card
export interface CardConfig {
    dueDateLabel: (inst: Installment, loan?: Loan) => string; 
    statusLabel: (inst: Installment, daysDiff: number) => { text: string; color: string } | null; 
    showProgress: boolean; 
}

// INTERFACE DO MÓDULO (STRATEGY PATTERN)
export interface ModalityStrategy {
    key: LoanBillingModality | 'DAILY' | string;
    
    // Core Financeiro
    calculate: (loan: Loan, inst: Installment, policy: LoanPolicy) => CalculationResult;
    
    // Renovação com suporte a Data Manual
    renew: (
        loan: Loan, 
        inst: Installment, 
        amountPaid: number, 
        allocation: PaymentAllocation, 
        today: Date, 
        forgivePenalty: boolean,
        manualDate?: Date | null
    ) => RenewalResult;
    
    // Fábrica de Parcelas
    generateInstallments: (params: InstallmentGenerationParams) => InstallmentGenerationResult;
    
    // UI Configs
    card: CardConfig;
}
