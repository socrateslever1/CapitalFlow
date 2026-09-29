import type { CapitalFlowSkillGateway } from './core/gateway';
import { SkillRegistry } from './core/registry';
import { createConsultarClienteSkill } from './consultar-cliente/skill';
import { createConsultarContratoSkill } from './consultar-contrato/skill';
import { createConsultarDividaSkill } from './consultar-divida/skill';
import { createConsultarParcelasSkill } from './consultar-parcelas/skill';
import { createConsultarVencimentosSkill } from './consultar-vencimentos/skill';
import { createConsultarAcordoSkill } from './consultar-acordo/skill';
import { financialSkillScaffolds } from './financial/skills';

export function createCapitalFlowSkillRegistry(gateway: CapitalFlowSkillGateway): SkillRegistry {
  const registry = new SkillRegistry();
  registry
    .register(createConsultarClienteSkill(gateway))
    .register(createConsultarDividaSkill(gateway))
    .register(createConsultarParcelasSkill(gateway))
    .register(createConsultarContratoSkill(gateway))
    .register(createConsultarVencimentosSkill(gateway))
    .register(createConsultarAcordoSkill(gateway));
  financialSkillScaffolds.forEach((skill) => registry.register(skill));
  return registry;
}
