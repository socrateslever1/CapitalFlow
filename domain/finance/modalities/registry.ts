
import { LoanBillingModality } from "../../../types";
import { ModalityStrategy } from "./types";

import { monthlyStrategy } from "./monthly/index";
import { dailyFreeStrategy } from "./dailyFree/index";
import { dailyFixedTermStrategy } from "./dailyFixedTerm/index";

import { daily30Strategy, daily30CapitalStrategy } from "./daily30/index";

// Mapeamento Oficial
const strategies: Record<string, ModalityStrategy> = {
    'MONTHLY': monthlyStrategy,
    'DAILY_FREE': dailyFreeStrategy,
    'DAILY_FIXED_TERM': dailyFixedTermStrategy,
    'DAILY_30_INTEREST': daily30Strategy,
    'DAILY_30_CAPITAL': daily30CapitalStrategy,
};

// Fallback Map para compatibilidade de dados legados (Migração segura)
const legacyFallback: Record<string, ModalityStrategy> = {
    'DAILY_FIXED': dailyFreeStrategy,
    'DAILY': monthlyStrategy 
};

export const modalityRegistry = {
    get(billingCycle: LoanBillingModality | string): ModalityStrategy {
        // 1. Tenta pegar a estratégia oficial
        const strategy = strategies[billingCycle];
        if (strategy) return strategy;

        // 2. Se não existir, tenta o fallback para legados
        if (legacyFallback[billingCycle]) {
            console.warn(`[Modality] Usando modalidade legada: ${billingCycle}. Recomenda-se migrar para uma modalidade oficial.`);
            return legacyFallback[billingCycle];
        }

        // 3. Último caso, retorna mensal para não quebrar
        console.error(`[Modality] Modalidade desconhecida: ${billingCycle}. Usando MONTHLY como fallback.`);
        return monthlyStrategy; 
    }
};
