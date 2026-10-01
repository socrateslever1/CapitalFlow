import type { CapitalFlowSkillGateway } from '../skills/core/gateway';
import { ToolRegistry } from './core/registry';
import type { FinancialToolGateway } from './financial/tools';
import { createFinancialToolScaffolds } from './financial/tools';
import { createReadOnlyTools } from './read/tools';

export function createCapitalFlowToolRegistry(
  gateway: CapitalFlowSkillGateway,
  financialGateway?: FinancialToolGateway,
): ToolRegistry {
  const registry = new ToolRegistry();
  createReadOnlyTools(gateway).forEach((tool) => registry.register(tool));
  createFinancialToolScaffolds(financialGateway).forEach((tool) => registry.register(tool));
  return registry;
}
