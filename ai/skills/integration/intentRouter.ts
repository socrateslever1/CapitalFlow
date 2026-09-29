import type { SkillContext } from '../core/types';
import type { SkillObserver } from '../core/execution';
import { executeRegisteredSkill } from '../core/execution';
import type { SkillRegistry } from '../core/registry';
import type { SkillResult } from '../core/result';
import { skillFailure } from '../core/result';

const ALLOWED_INTENTS = new Set([
  'consultar_cliente',
  'consultar_divida',
  'consultar_parcelas',
  'consultar_contrato',
  'consultar_vencimentos',
  'consultar_acordo',
  'registrar_pagamento',
  'estornar_pagamento',
  'renovar_pagamento',
  'capitalizar_saldo',
  'quitar_por_acordo',
  'novo_aporte',
  'registrar_pagamento_acordo',
  'aplicar_desconto',
  'alterar_vencimento',
]);

export async function executeSkillIntent<TOutput>(
  registry: SkillRegistry,
  intent: string,
  input: unknown,
  context: SkillContext,
  observer?: SkillObserver,
): Promise<SkillResult<TOutput>> {
  const normalizedIntent = String(intent || '').trim().toLowerCase();
  if (!ALLOWED_INTENTS.has(normalizedIntent)) {
    return skillFailure('NOT_FOUND', 'Intent não corresponde a uma Skill permitida.');
  }
  return executeRegisteredSkill<TOutput>(registry, normalizedIntent, input, context, observer);
}
