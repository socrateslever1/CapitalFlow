import type { SkillError } from './result';

export type SkillValidation =
  | { valid: true }
  | { valid: false; error: SkillError; message: string };

export const validInput = (): SkillValidation => ({ valid: true });
export const invalidInput = (message: string): SkillValidation => ({ valid: false, error: 'INVALID_INPUT', message });

export const cleanText = (value: unknown, maxLength = 200): string =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

export const isIsoDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
