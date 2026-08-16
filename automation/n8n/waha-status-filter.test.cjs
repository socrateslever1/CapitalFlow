'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const workflow = require(path.join(__dirname, 'capitalflow-whatsapp.json'))[0];

test('ignores WhatsApp Status broadcasts before resolving a client phone', () => {
  const gate = workflow.nodes.find((node) => node.id === 'e-grupo-if-node');
  assert.ok(gate);
  assert.equal(gate.parameters.conditions.combinator, 'or');
  assert.match(JSON.stringify(gate.parameters), /status@broadcast/);
  assert.deepEqual(workflow.connections[gate.name].main[0], []);
});
