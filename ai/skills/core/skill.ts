import type { SkillResult } from './result';
import type { SkillValidation } from './validation';
import type { SkillCategory, SkillContext, SkillPermission, SkillRisk } from './types';

export interface CapitalFlowSkill<TInput, TOutput> {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  risk: SkillRisk;
  enabled: boolean;
  requiresAuthentication: boolean;
  requiresConfirmation: boolean;
  requiredPermissions: SkillPermission[];
  blockers?: string[];
  validate(input: TInput, context: SkillContext): Promise<SkillValidation> | SkillValidation;
  execute(input: TInput, context: SkillContext): Promise<SkillResult<TOutput>>;
}
