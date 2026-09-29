import type { CapitalFlowSkill } from './skill';
import type { SkillCategory, SkillContext, SkillRisk } from './types';
import type { SkillResult } from './result';
import { skillFailure } from './result';
import { authorizeSkillContext } from './permissions';

type AnySkill = CapitalFlowSkill<any, any>;

export class SkillRegistry {
  private readonly skills = new Map<string, AnySkill>();

  register(skill: AnySkill): this {
    if (this.skills.has(skill.id)) throw new Error(`Skill duplicada: ${skill.id}`);
    this.skills.set(skill.id, skill);
    return this;
  }

  get<TInput = unknown, TOutput = unknown>(id: string): CapitalFlowSkill<TInput, TOutput> | undefined {
    return this.skills.get(id) as CapitalFlowSkill<TInput, TOutput> | undefined;
  }

  list(): AnySkill[] {
    return [...this.skills.values()];
  }

  byCategory(category: SkillCategory): AnySkill[] {
    return this.list().filter((skill) => skill.category === category);
  }

  byRisk(risk: SkillRisk): AnySkill[] {
    return this.list().filter((skill) => skill.risk === risk);
  }

  canExecute(id: string, context: SkillContext): SkillResult<true> {
    const skill = this.skills.get(id);
    if (!skill) return skillFailure('NOT_FOUND', 'Skill não encontrada.');
    if (!skill.enabled) return skillFailure('SKILL_DISABLED', skill.blockers?.[0] || 'Skill desabilitada.');
    return authorizeSkillContext(context, skill.requiredPermissions);
  }
}
