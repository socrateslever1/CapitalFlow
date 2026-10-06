import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const roots = ['components', 'features', 'pages'];
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx']);
const forbidden = [
  /payment engine/i,
  /backend autorizado/i,
  /backend confirmou/i,
  /\bbackend\b/i,
  /prévia autoritativa/i,
  /\bRPC\b/i,
  /\bMCP\b/i,
  /\bSkill\b/i,
  /\bTool\b/i,
  /\btenant\b/i,
  /\bstaging\b/i,
  /\bmigration\b/i,
  /idempotência/i,
  /atomicidade/i,
  /expected_preview/i,
  /financial_operation/i,
  /financial engine/i,
  /posição persistida/i,
  /fonte autoritativa/i,
];

const files = [];
const walk = (directory) => {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (extensions.has(path.extname(entry.name))) files.push(absolute);
  }
};

for (const directory of roots) walk(path.join(root, directory));
for (const file of [
  'services/payments.service.ts',
  'services/contracts.service.ts',
  'services/ledger/ledgerActions.ts',
  'features/agreements/services/agreementService.ts',
]) {
  const absolute = path.join(root, file);
  if (fs.existsSync(absolute) && !files.includes(absolute)) files.push(absolute);
}

const withoutComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|\n)\s*\/\/.*(?=\n|$)/g, '$1');

const findMatches = (source) => {
  const matches = [];
  const stringPattern = /(['"])((?:\\.|(?!\1)[^\r\n])*)\1|(`)((?:\\.|(?!\3)[\s\S])*?)\3/g;
  for (const match of source.matchAll(stringPattern)) matches.push({ text: match[2] ?? match[4], index: match.index });

  const jsxTextPattern = />([^<>{}\n]+)</g;
  for (const match of source.matchAll(jsxTextPattern)) matches.push({ text: match[1], index: match.index });
  return matches;
};

const failures = [];
for (const file of files) {
  const source = withoutComments(fs.readFileSync(file, 'utf8'));
  for (const match of findMatches(source)) {
    const line = source.slice(0, match.index).split('\n').length;
    const lineText = source.split('\n')[line - 1] || '';
    const extension = path.extname(file);
    const likelyUiSink = /(?:throw new Error|new Error|setError|toast|notify|alert|message|description|title|label|placeholder|aria-label|helperText|return\s+['"`])/i.test(lineText);
    if (/console\.(?:log|warn|error|info|debug)\s*\(/i.test(lineText)) continue;
    if ((extension === '.ts' || extension === '.js') && !likelyUiSink && match.index !== undefined) continue;
    for (const pattern of forbidden) {
      if (pattern.test(match.text)) {
        failures.push(`${path.relative(root, file)}:${line} -> texto técnico visível: ${match.text.trim()}`);
        break;
      }
    }
  }
}

if (failures.length) {
  console.error('Vazamento de texto técnico na interface:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(`✓ textos visíveis sem termos técnicos proibidos (${files.length} arquivos verificados)`);
