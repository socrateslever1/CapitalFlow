import { McpServer } from '@modelcontextprotocol/server';
import type { ToolContext } from '../tools/core/context';
import type { ToolRegistry } from '../tools/core/registry';
import { CapitalFlowMcpAdapter } from './adapter';

export type McpAuthenticatedContextResolver = () => ToolContext | Promise<ToolContext>;

export function createCapitalFlowMcpServer(
  registry: ToolRegistry,
  resolveAuthenticatedContext: McpAuthenticatedContextResolver,
): McpServer {
  const adapter = new CapitalFlowMcpAdapter(registry);
  const server = new McpServer(
    { name: 'capitalflow-readonly', version: '1.0.0' },
    { instructions: 'Somente leitura. O tenant vem da sessão autenticada e nunca dos argumentos da Tool.' },
  );

  for (const name of adapter.listTools()) {
    const tool = registry.get(adapter.getToolId(name));
    if (!tool || !tool.enabled || tool.risk !== 'READ_ONLY') continue;
    server.registerTool(
      name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      },
      async (input) => {
        const context = await resolveAuthenticatedContext();
        const result = await adapter.call(name, input, context);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          structuredContent: result,
          ...(!result.ok ? { isError: true } : {}),
        };
      },
    );
  }

  return server;
}
