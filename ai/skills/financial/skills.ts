import type { CapitalFlowSkill } from '../core/skill';
import { skillFailure } from '../core/result';
import { validInput } from '../core/validation';

export type FinancialSkillInput = Record<string, unknown>;
export type FinancialSkillOutput = never;

const blockers = [
  'Bloqueada até as migrations V4 e as RPCs de Skills serem validadas em staging com reconciliação financeira.',
];

function blockedFinancialSkill(id: string, name: string, reversal = false): CapitalFlowSkill<FinancialSkillInput, FinancialSkillOutput> {
  return {
    id,
    name,
    description: 'Contrato futuro de operação financeira; nenhuma mutação está habilitada.',
    category: 'PAYMENT',
    risk: 'FINANCIAL_WRITE',
    enabled: false,
    requiresAuthentication: true,
    requiresConfirmation: true,
    requiredPermissions: [reversal ? 'FINANCIAL_REVERSAL' : 'FINANCIAL_WRITE'],
    blockers,
    validate: validInput,
    async execute() {
      return skillFailure('SKILL_DISABLED', blockers[0]);
    },
  };
}

export const financialSkillScaffolds = [
  blockedFinancialSkill('registrar_pagamento', 'Registrar pagamento'),
  blockedFinancialSkill('estornar_pagamento', 'Estornar pagamento', true),
  blockedFinancialSkill('renovar_pagamento', 'Renovar pagamento'),
  blockedFinancialSkill('capitalizar_saldo', 'Capitalizar saldo'),
  blockedFinancialSkill('quitar_por_acordo', 'Quitar por acordo'),
  blockedFinancialSkill('novo_aporte', 'Novo aporte'),
  blockedFinancialSkill('registrar_pagamento_acordo', 'Registrar pagamento de acordo'),
  blockedFinancialSkill('aplicar_desconto', 'Aplicar desconto'),
  blockedFinancialSkill('alterar_vencimento', 'Alterar vencimento'),
];
