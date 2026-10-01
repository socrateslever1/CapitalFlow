import type { ToolContext } from '../tools/core/context';
import type { ToolResult } from '../tools/core/errors';
import type { ToolRegistry } from '../tools/core/registry';

const MCP_TOOL_MAP = {
  search_client: 'client.search',
  get_client: 'client.get',
  get_debt: 'debt.get',
  list_installments: 'installments.list',
  get_contract: 'contract.get',
  list_due_dates: 'due_dates.list',
  get_agreement: 'agreement.get',
} as const;

export type CapitalFlowMcpToolName = keyof typeof MCP_TOOL_MAP;

export class CapitalFlowMcpAdapter {
  constructor(private readonly registry: ToolRegistry) {}

  listTools(): CapitalFlowMcpToolName[] {
    return Object.keys(MCP_TOOL_MAP) as CapitalFlowMcpToolName[];
  }

  getToolId(name: CapitalFlowMcpToolName): string {
    return MCP_TOOL_MAP[name];
  }

  async call(name: string, input: unknown, context: ToolContext): Promise<ToolResult<unknown>> {
    const toolId = MCP_TOOL_MAP[name as CapitalFlowMcpToolName];
    if (!toolId) return { ok: false, error: 'NOT_FOUND', message: 'Tool MCP não encontrada.' };
    return this.registry.execute(toolId, input, context);
  }
}
