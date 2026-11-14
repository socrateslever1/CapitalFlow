import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStructuredAssistantPrompt,
  parseStructuredAIResponse,
  STRUCTURED_AI_RESPONSE_SCHEMA,
  type StructuredAIResponse,
} from '../../services/ai/assistantContract';

test('parses fenced JSON and normalizes optional fields', () => {
  const result = parseStructuredAIResponse('```json\n{"intent":"ANALYZE_PORTFOLIO","feedback":"Carteira analisada.","suggestions":["Revisar atrasos"],"riskScore":120}\n```');

  assert.deepEqual(result, {
    intent: 'ANALYZE_PORTFOLIO',
    feedback: 'Carteira analisada.',
    suggestions: ['Revisar atrasos'],
    riskScore: 100,
  });
});

test('rejects JSON without the minimum response contract', () => {
  assert.throws(
    () => parseStructuredAIResponse('{"intent":"UNKNOWN"}'),
    /Resposta de IA incompleta/,
  );
});

test('builds a bounded provider-neutral prompt with explicit JSON output', () => {
  const prompt = buildStructuredAssistantPrompt('OPERATOR_CRO', 'Como está minha carteira?', {
    totalLent: 1000,
    longText: 'x'.repeat(20_000),
  });

  assert.match(prompt, /JSON puro/);
  assert.match(prompt, /Como está minha carteira/);
  assert.ok(prompt.length <= 12_000);
});

test('preserves the stable response shape', () => {
  const response: StructuredAIResponse = parseStructuredAIResponse(
    '{"intent":"REGISTER_CLIENT","feedback":"Cliente preparado.","analysis":3,"data":{"name":"Maria"},"suggestions":["Conferir"]}',
  );

  assert.deepEqual(response, {
    intent: 'REGISTER_CLIENT',
    feedback: 'Cliente preparado.',
    data: { name: 'Maria' },
    suggestions: ['Conferir'],
  });
});

test('exposes a provider-neutral schema with only required response fields', () => {
  assert.deepEqual(STRUCTURED_AI_RESPONSE_SCHEMA.required, ['intent', 'feedback']);
  assert.equal(STRUCTURED_AI_RESPONSE_SCHEMA.properties.suggestions.type, 'ARRAY');
  assert.equal(STRUCTURED_AI_RESPONSE_SCHEMA.properties.riskScore.type, 'NUMBER');
});
