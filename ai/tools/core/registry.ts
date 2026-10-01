import type { CapitalFlowTool, ToolExecutionOptions } from './types';
import type { ToolContext } from './context';
import type { ToolResult } from './errors';
import { toolFailure } from './errors';
import { authorizeToolContext } from './permissions';

type AnyTool = CapitalFlowTool<any, any>;

export class ToolRegistry {
  private readonly tools = new Map<string, AnyTool>();

  register(tool: AnyTool): this {
    if (this.tools.has(tool.id)) throw new Error(`Tool duplicada: ${tool.id}`);
    this.tools.set(tool.id, tool);
    return this;
  }

  get<TInput = unknown, TOutput = unknown>(id: string): CapitalFlowTool<TInput, TOutput> | undefined {
    return this.tools.get(id) as CapitalFlowTool<TInput, TOutput> | undefined;
  }

  list(): AnyTool[] {
    return [...this.tools.values()];
  }

  async execute<TOutput>(
    id: string,
    input: unknown,
    context: ToolContext,
    options: ToolExecutionOptions = {},
  ): Promise<ToolResult<TOutput>> {
    const tool = this.tools.get(id);
    if (!tool) return toolFailure('NOT_FOUND', 'Tool não encontrada.');
    if (!tool.enabled) return toolFailure('TOOL_DISABLED', tool.blockers?.[0] || 'Tool desabilitada.');

    const authorization = authorizeToolContext(context, tool.permissions);
    if ('error' in authorization) return toolFailure(authorization.error, authorization.message);
    if (tool.requiresConfirmation && !options.confirmed) {
      return toolFailure('CONFIRMATION_REQUIRED', 'Confirmação explícita é obrigatória para esta Tool.');
    }

    const parsed = tool.inputSchema.safeParse(input);
    if (!parsed.success) return toolFailure('INVALID_INPUT', 'Entrada inválida para a Tool.');

    try {
      return await tool.execute(parsed.data, context);
    } catch {
      return toolFailure('BACKEND_ERROR', 'O backend autorizado não respondeu com segurança.');
    }
  }
}
