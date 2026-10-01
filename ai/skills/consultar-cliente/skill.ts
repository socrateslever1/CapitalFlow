import type { CapitalFlowSkill } from '../core/skill';
import type { ClientLookupKind, SkillClient } from '../core/gateway';
import { executeToolAsSkill } from '../core/helpers';
import { cleanText } from '../core/validation';
import type { ToolRegistry } from '../../tools/core/registry';
import type { ConsultarClienteInput } from './schema';
import { validateConsultarCliente } from './schema';

export function createConsultarClienteSkill(tools: ToolRegistry): CapitalFlowSkill<ConsultarClienteInput, SkillClient> {
  return {
    id: 'consultar_cliente',
    name: 'Consultar cliente',
    description: 'Localiza um único cliente dentro do perfil autenticado.',
    category: 'CLIENT',
    risk: 'READ_ONLY',
    enabled: true,
    requiresAuthentication: true,
    requiresConfirmation: false,
    requiredPermissions: ['SKILLS_READ'],
    validate: validateConsultarCliente,
    async execute(input, context) {
      const entries: Array<[ClientLookupKind, string]> = [
        ['NAME', cleanText(input.nome)],
        ['CODE', cleanText(input.codigo)],
        ['PHONE', cleanText(input.telefone)],
        ['DOCUMENT', cleanText(input.documento)],
      ];
      const [kind, query] = entries.find(([, value]) => Boolean(value))!;
      return executeToolAsSkill(tools, 'client.get', { kind, query }, context);
    },
  };
}
