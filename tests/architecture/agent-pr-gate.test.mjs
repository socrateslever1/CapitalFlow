import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateAgentPr, readPrBodyFromEvent, REQUIRED_SECTIONS } from '../../scripts/guards/verify-agent-pr.mjs';

const VALID_BODY = `## Solicitação original
Permitir selecionar a conta bancária no recebimento, sem alterar os contratos existentes.

## Escopo autorizado
Somente seletor de destino e serviços de roteamento da Minha Carteira para o perfil autenticado.

## Fora do escopo
Não modificar contratos anteriores, ledger histórico, estornos, nem o comportamento de outros perfis.

## Critérios de aceitação
- [x] Conta selecionada recebe um único crédito integral; capital e juros seguem contabilizados separadamente.
- [x] Nenhuma seleção mantém o comportamento contábil atual.

## Evidências de testes
PASS: npm run test:wallet-receipts; PASS: npm run test:quality; teste com dois perfis distintos.

## Riscos e reversão
Risco de duplicidade de recebimento; reverter o commit de interface, sem atualizar dados financeiros históricos.

## Revisão independente
Revisor QA conferiu diffs, isolamento de perfis e resultado dos testes. Evidência anexada na revisão do PR.
`;

test('contrato completo com evidências passa', () => {
  assert.deepEqual(validateAgentPr(VALID_BODY), []);
  assert.equal(REQUIRED_SECTIONS.length, 7);
});

test('PR vazio ou sem seções é reprovado', () => {
  assert.ok(validateAgentPr('').length >= 7);
  assert.ok(validateAgentPr(null).length >= 1);
});

test('seção apenas com comentário ou placeholder não passa', () => {
  const body = VALID_BODY.replace('Somente seletor de destino e serviços de roteamento da Minha Carteira para o perfil autenticado.', '<!-- Descrever aqui -->');
  assert.match(validateAgentPr(body).join(' '), /Escopo autorizado/);
});

test('checklist de aceitação é obrigatório', () => {
  const body = VALID_BODY.replace('- [x] Conta selecionada', '- Conta selecionada').replace('- [x] Nenhuma seleção', '- Nenhuma seleção');
  assert.match(validateAgentPr(body).join(' '), /checklist/);
});

test('sem resultado explícito de testes falha', () => {
  const body = VALID_BODY.replace('PASS: npm run test:wallet-receipts; PASS: npm run test:quality; teste com dois perfis distintos.', 'Foram incluídos testes e serão executados em algum momento posterior.');
  assert.match(validateAgentPr(body).join(' '), /resultados de testes/);
});

test('cabeçalho duplicado não mascara a seção vazia', () => {
  const body = VALID_BODY + '\n## Riscos e reversão\n';
  assert.match(validateAgentPr(body).join(' '), /Riscos e reversão/);
});

test('evento exige objeto pull_request e lê a descrição sem executar conteúdo', () => {
  const folder = mkdtempSync(join(tmpdir(), 'agent-pr-'));
  try {
    const file = join(folder, 'event.json');
    writeFileSync(file, JSON.stringify({ pull_request: { body: VALID_BODY } }));
    assert.equal(readPrBodyFromEvent(file), VALID_BODY);
    writeFileSync(file, JSON.stringify({ issue: { body: VALID_BODY } }));
    assert.throws(() => readPrBodyFromEvent(file), /pull_request/);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('tamanho excessivo falha de forma explícita', () => {
  assert.match(validateAgentPr(VALID_BODY + 'X'.repeat(70_000)).join(' '), /64 KiB/);
});
