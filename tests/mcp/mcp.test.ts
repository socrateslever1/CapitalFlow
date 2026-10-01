import assert from 'node:assert/strict';
import { CapitalFlowMcpAdapter } from '../../ai/mcp/adapter';
import { createCapitalFlowMcpServer } from '../../ai/mcp/server';
import { createToolContext } from '../../ai/tools/core/context';
import { createCapitalFlowToolRegistry } from '../../ai/tools/registry';
import { createFakeGateway, skillContext } from '../skills/fakeGateway';

const registry = createCapitalFlowToolRegistry(createFakeGateway({
  findClients: async () => [{ id: 'client-1', name: 'Maria Silva' }],
}));
const context = createToolContext(skillContext);
const adapter = new CapitalFlowMcpAdapter(registry);

assert.deepEqual(adapter.listTools(), [
  'search_client', 'get_client', 'get_debt', 'list_installments',
  'get_contract', 'list_due_dates', 'get_agreement',
]);

const result = await adapter.call('get_client', { kind: 'NAME', query: 'Maria Silva' }, context);
assert.equal(result.ok, true);
assert.equal((await adapter.call('execute_payment', {}, context) as any).error, 'NOT_FOUND');
assert.equal((await adapter.call('get_client', { kind: 'NAME', query: 'Maria', profileId: 'inventado' }, context) as any).error, 'INVALID_INPUT');

const server = createCapitalFlowMcpServer(registry, () => context);
assert.ok(server);

console.log('Suite MCP read-only concluída com sucesso.');
