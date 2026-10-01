import type { ZodType } from 'zod';
import type { SkillPermission, SkillRisk } from '../../skills/core/types';
import type { ToolContext } from './context';
import type { ToolResult } from './errors';

export interface CapitalFlowTool<TInput, TOutput> {
  id: string;
  description: string;
  risk: SkillRisk;
  enabled: boolean;
  inputSchema: ZodType<TInput>;
  permissions: SkillPermission[];
  requiresAuthentication: boolean;
  requiresConfirmation: boolean;
  blockers?: string[];
  execute(input: TInput, context: ToolContext): Promise<ToolResult<TOutput>>;
}

export type ToolExecutionOptions = {
  confirmed?: boolean;
};
