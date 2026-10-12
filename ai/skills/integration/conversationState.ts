import type { IntentClassification } from './intentClassifier';

export type ConversationState =
  | 'NEW'
  | 'IDENTIFYING'
  | 'IDENTIFIED'
  | 'INTENT_PENDING'
  | 'RESOLVING_READ'
  | 'AWAITING_CONFIRMATION'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'HUMAN_HANDOFF';

export type ConversationEvent =
  | 'START'
  | 'IDENTITY_REQUIRED'
  | 'IDENTITY_CONFIRMED'
  | 'UNKNOWN_INTENT'
  | 'READ_INTENT'
  | 'WRITE_INTENT'
  | 'CONFIRM'
  | 'CANCEL'
  | 'EXECUTION_SUCCESS'
  | 'EXECUTION_FAILED'
  | 'HANDOFF_REQUESTED'
  | 'HANDOFF_CLOSED'
  | 'RESET'
  | 'COMPLETE';

export type ConversationTransition =
  | { ok: true; state: ConversationState }
  | { ok: false; state: ConversationState; error: 'INVALID_TRANSITION' };

const transitions: Record<ConversationState, Partial<Record<ConversationEvent, ConversationState>>> = {
  NEW: {
    START: 'IDENTIFYING',
    IDENTITY_REQUIRED: 'IDENTIFYING',
    IDENTITY_CONFIRMED: 'IDENTIFIED',
    HANDOFF_REQUESTED: 'HUMAN_HANDOFF',
    COMPLETE: 'COMPLETED',
  },
  IDENTIFYING: {
    IDENTITY_REQUIRED: 'IDENTIFYING',
    IDENTITY_CONFIRMED: 'IDENTIFIED',
    HANDOFF_REQUESTED: 'HUMAN_HANDOFF',
    RESET: 'NEW',
    COMPLETE: 'COMPLETED',
  },
  IDENTIFIED: {
    UNKNOWN_INTENT: 'INTENT_PENDING',
    READ_INTENT: 'RESOLVING_READ',
    WRITE_INTENT: 'AWAITING_CONFIRMATION',
    HANDOFF_REQUESTED: 'HUMAN_HANDOFF',
    RESET: 'NEW',
    COMPLETE: 'COMPLETED',
  },
  INTENT_PENDING: {
    UNKNOWN_INTENT: 'INTENT_PENDING',
    READ_INTENT: 'RESOLVING_READ',
    WRITE_INTENT: 'AWAITING_CONFIRMATION',
    HANDOFF_REQUESTED: 'HUMAN_HANDOFF',
    CANCEL: 'IDENTIFIED',
    RESET: 'NEW',
    COMPLETE: 'COMPLETED',
  },
  RESOLVING_READ: {
    EXECUTION_SUCCESS: 'IDENTIFIED',
    EXECUTION_FAILED: 'IDENTIFIED',
    HANDOFF_REQUESTED: 'HUMAN_HANDOFF',
    RESET: 'NEW',
    COMPLETE: 'COMPLETED',
  },
  AWAITING_CONFIRMATION: {
    CONFIRM: 'EXECUTING',
    CANCEL: 'IDENTIFIED',
    HANDOFF_REQUESTED: 'HUMAN_HANDOFF',
    RESET: 'NEW',
    COMPLETE: 'COMPLETED',
  },
  EXECUTING: {
    EXECUTION_SUCCESS: 'IDENTIFIED',
    EXECUTION_FAILED: 'IDENTIFIED',
    HANDOFF_REQUESTED: 'HUMAN_HANDOFF',
    COMPLETE: 'COMPLETED',
  },
  HUMAN_HANDOFF: {
    HANDOFF_CLOSED: 'IDENTIFIED',
    RESET: 'NEW',
    COMPLETE: 'COMPLETED',
  },
  COMPLETED: {
    START: 'IDENTIFYING',
    RESET: 'NEW',
  },
};

export function transitionConversationState(
  current: ConversationState,
  event: ConversationEvent,
): ConversationTransition {
  const next = transitions[current]?.[event];
  if (!next) return { ok: false, state: current, error: 'INVALID_TRANSITION' };
  return { ok: true, state: next };
}

export function observedStateForIntent(
  identified: boolean,
  classification: IntentClassification,
): ConversationState {
  if (!identified) return 'IDENTIFYING';
  if (classification.route === 'HUMAN_HANDOFF') return 'HUMAN_HANDOFF';
  if (classification.route === 'READ_ONLY_SKILL') return 'RESOLVING_READ';
  if (classification.route === 'UNKNOWN' || classification.route === 'LOAN_INTEREST') return 'INTENT_PENDING';

  // Escritas financeiras continuam bloqueadas nesta etapa. Não avançar para EXECUTING.
  return 'IDENTIFIED';
}
