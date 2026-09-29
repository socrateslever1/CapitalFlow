import { supabaseSkillGateway } from './backend/supabaseSkillGateway';
import { createCapitalFlowSkillRegistry } from './registry';

export const capitalFlowSkillRegistry = createCapitalFlowSkillRegistry(supabaseSkillGateway);

export * from './core/types';
export * from './core/result';
export * from './core/skill';
export * from './core/registry';
export * from './core/execution';
export * from './core/gateway';
export * from './registry';
