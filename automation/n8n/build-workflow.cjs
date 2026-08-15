'use strict';

const fs = require('node:fs');
const path = require('node:path');

const [sourcePath, outputPath] = process.argv.slice(2);
if (!sourcePath || !outputPath) {
  throw new Error('Uso: node build-workflow.cjs <workflow-exportado.json> <saida.json>');
}

const workflows = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const workflow = Array.isArray(workflows) ? workflows[0] : workflows;
if (!workflow?.nodes || !workflow?.connections) throw new Error('Export de workflow inválido.');

workflow.active = false;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify([workflow], null, 2)}\n`, 'utf8');
console.log('Workflow determinístico compilado com sucesso.');
