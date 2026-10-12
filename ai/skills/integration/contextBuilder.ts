import type { SkillContext } from '../core/types';
import type { ConversationState } from './conversationState';
import type { IntentClassification } from './intentClassifier';

export type TrustedContextEnvelope = Readonly<{
  version: 1;
  identity: Readonly<{
    userId: string;
    profileId: string;
    clientId?: string;
    authenticated: true;
  }>;
  conversation: Readonly<{
    source: SkillContext['source'];
    requestId?: string;
    conversationId?: string;
    state: ConversationState;
  }>;
  routing: IntentClassification;
  guardrails: Readonly<{
    tenantFromTrustedContextOnly: true;
    financialWritesEnabled: false;
    explicitConfirmationRequired: true;
    rawPromptPersisted: false;
  }>;
}>;

export function buildTrustedContextEnvelope(
  context: SkillContext,
  state: ConversationState,
  routing: IntentClassification,
): TrustedContextEnvelope {
  if (!context.authenticated || !context.userId || !context.profileId) {
    throw new Error('Contexto autenticado e perfil confiável são obrigatórios.');
  }

  return Object.freeze({
    version: 1 as const,
    identity: Object.freeze({
      userId: context.userId,
      profileId: context.profileId,
      ...(context.clientId ? { clientId: context.clientId } : {}),
      authenticated: true as const,
    }),
    conversation: Object.freeze({
      source: context.source,
      ...(context.requestId ? { requestId: context.requestId } : {}),
      ...(context.conversationId ? { conversationId: context.conversationId } : {}),
      state,
    }),
    routing,
    guardrails: Object.freeze({
      tenantFromTrustedContextOnly: true as const,
      financialWritesEnabled: false as const,
      explicitConfirmationRequired: true as const,
      rawPromptPersisted: false as const,
    }),
  });
}
