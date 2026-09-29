import type { CapitalFlowSkill } from '../core/skill';
import type { CapitalFlowSkillGateway, ClientLookupKind, SkillClient } from '../core/gateway';
import { backendFailure } from '../core/helpers';
import { hasPermission } from '../core/permissions';
import { skillFailure, skillSuccess } from '../core/result';
import { cleanText } from '../core/validation';
import type { ConsultarClienteInput } from './schema';
import { validateConsultarCliente } from './schema';

export function createConsultarClienteSkill(gateway: CapitalFlowSkillGateway): CapitalFlowSkill<ConsultarClienteInput, SkillClient> {
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
      if (kind === 'DOCUMENT' && !hasPermission(context, 'CLIENT_DOCUMENT_READ')) {
        return skillFailure('NOT_AUTHORIZED', 'Consulta por documento exige permissão específica.');
      }
      try {
        const clients = await gateway.findClients({
          kind,
          query,
          includeDocument: kind === 'DOCUMENT' && hasPermission(context, 'CLIENT_DOCUMENT_READ'),
        }, context);
        if (clients.length === 0) return skillFailure('NOT_FOUND', 'Cliente não encontrado.');
        if (clients.length > 1) return skillFailure('AMBIGUOUS', 'Mais de um cliente corresponde à consulta.');
        return skillSuccess(clients[0]);
      } catch (error) {
        return backendFailure(error);
      }
    },
  };
}
