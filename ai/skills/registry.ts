import type { CapitalFlowSkillGateway } from './core/gateway';
import { SkillRegistry } from './core/registry';
import { createConsultarClienteSkill } from './consultar-cliente/skill';
import { createConsultarContratoSkill } from './consultar-contrato/skill';
import { createConsultarDividaSkill } from './consultar-divida/skill';
import { createConsultarParcelasSkill } from './consultar-parcelas/skill';
import { createConsultarVencimentosSkill } from './consultar-vencimentos/skill';
import { createConsultarAcordoSkill } from './consultar-acordo/skill';
import { financialSkillScaffolds } from './financial/skills';
import { createCapitalFlowToolRegistry } from '../tools/registry';

export function createCapitalFlowSkillRegistry(gateway: CapitalFlowSkillGateway): SkillRegistry {
  const registry = new SkillRegistry();
  const tools = createCapitalFlowToolRegistry(gateway);
  registry
    .register(createConsultarClienteSkill(tools))
    .register(createConsultarDividaSkill(tools))
    .register(createConsultarParcelasSkill(tools))
    .register(createConsultarContratoSkill(tools))
    .register(createConsultarVencimentosSkill(tools))
    .register(createConsultarAcordoSkill(tools));
  financialSkillScaffolds.forEach((skill) => registry.register(skill));
  return registry;
}
