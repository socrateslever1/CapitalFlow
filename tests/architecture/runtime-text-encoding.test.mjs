import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repairableUtf8AsLatin1 = /[^\s'\"]*(?:\u00c3[\u0080-\u00bf]|\u00c2[\u0080-\u00bf]|\u00e2\u0080[\u0090-\u00bf])[^\s'\"]*/g;

const SOURCE_ROOTS = [
  'App.tsx',
  'components',
  'containers',
  'contexts',
  'domain',
  'features',
  'hooks',
  'i18n',
  'layout',
  'pages',
  'services',
  'utils',
  'automation/n8n',
];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.json']);

const collectSourceFiles = (entryPath, out = []) => {
  if (!existsSync(entryPath)) return out;
  const stat = statSync(entryPath);
  if (stat.isDirectory()) {
    for (const child of readdirSync(entryPath)) {
      collectSourceFiles(path.join(entryPath, child), out);
    }
  } else if (SOURCE_EXTENSIONS.has(path.extname(entryPath))) {
    out.push(entryPath);
  }
  return out;
};

const repairToken = (token) => {
  const repaired = Buffer.from(token, 'latin1').toString('utf8');
  return repaired.includes('\ufffd') ? token : repaired;
};

test('fontes de execução não contêm texto UTF-8 interpretado como Latin-1', () => {
  const files = SOURCE_ROOTS.flatMap((root) => collectSourceFiles(root));

  const corrupted = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(repairableUtf8AsLatin1)) {
      if (repairToken(match[0]) !== match[0]) {
        corrupted.push(`${file}:${match.index}:${match[0]}`);
      }
    }
  }

  assert.deepEqual(corrupted, [], `Texto corrompido encontrado em:\n${corrupted.join('\n')}`);
});
