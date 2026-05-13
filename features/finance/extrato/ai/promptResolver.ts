import { baseSystemPrompt } from './prompts/base.system.prompt';
import { extratoSummaryPrompt } from './prompts/extrato.summary.prompt';
import { extratoExplainResultPrompt } from './prompts/extrato.explain-result.prompt';
import { extratoExecutiveSummaryPrompt } from './prompts/extrato.executive-summary.prompt';
import { extratoCashAnalysisPrompt } from './prompts/extrato.cash-analysis.prompt';
import { extratoOperationsImpactPrompt } from './prompts/extrato.operations-impact.prompt';
import { extratoClientImpactPrompt } from './prompts/extrato.client-impact.prompt';
import { extratoFinancialAdvicePrompt } from './prompts/extrato.financial-advice.prompt';

export type ActionType = 
    | 'SUMMARY'
    | 'EXPLAIN_RESULT'
    | 'EXECUTIVE_SUMMARY'
    | 'CASH_ANALYSIS'
    | 'OPERATIONS_IMPACT'
    | 'CLIENT_IMPACT'
    | 'FINANCIAL_ADVICE'
    | 'FREE_CHAT';

export const getExtratoPromptByAction = (actionType: ActionType, userQuestion?: string): string => {
    let actionPrompt = '';
    
    switch (actionType) {
        case 'SUMMARY': actionPrompt = extratoSummaryPrompt; break;
        case 'EXPLAIN_RESULT': actionPrompt = extratoExplainResultPrompt; break;
        case 'EXECUTIVE_SUMMARY': actionPrompt = extratoExecutiveSummaryPrompt; break;
        case 'CASH_ANALYSIS': actionPrompt = extratoCashAnalysisPrompt; break;
        case 'OPERATIONS_IMPACT': actionPrompt = extratoOperationsImpactPrompt; break;
        case 'CLIENT_IMPACT': actionPrompt = extratoClientImpactPrompt; break;
        case 'FINANCIAL_ADVICE': actionPrompt = extratoFinancialAdvicePrompt; break;
        case 'FREE_CHAT': actionPrompt = userQuestion || 'Analise os dados financeiros.'; break;
        default: actionPrompt = extratoSummaryPrompt;
    }

    return `${baseSystemPrompt}\n\nInstrução específica: ${actionPrompt}\n\nContexto fornecido pelo sistema (JSON):`;
};

export { baseSystemPrompt };
