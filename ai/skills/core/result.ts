export type SkillError =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'AMBIGUOUS'
  | 'NOT_AUTHORIZED'
  | 'CONFIRMATION_REQUIRED'
  | 'BACKEND_ERROR'
  | 'BUSINESS_RULE_BLOCKED'
  | 'SKILL_DISABLED';

export type SkillResult<T> =
  | { ok: true; data: T; message?: string; metadata?: Record<string, unknown> }
  | { ok: false; error: SkillError; message: string };

export const skillSuccess = <T>(data: T, metadata?: Record<string, unknown>): SkillResult<T> => ({
  ok: true,
  data,
  ...(metadata ? { metadata } : {}),
});

export const skillFailure = <T = never>(error: SkillError, message: string): SkillResult<T> => ({
  ok: false,
  error,
  message,
});
