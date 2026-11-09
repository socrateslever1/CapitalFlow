// Gatilho permanente: nenhuma tela em português pode exibir texto em inglês.
// Se este teste falhar, traduza o texto apontado ou, se for nome próprio/termo oficial de terceiro,
// registre-o em PROPER_NAMES (scripts/i18n/englishUiText.mjs) com a justificativa.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { englishWordsIn, findEnglishUiText } from '../../scripts/i18n/englishUiText.mjs';
import { ptBR } from '../../i18n/locales/pt-BR';
import { en } from '../../i18n/locales/en';
import { es } from '../../i18n/locales/es';
import { navLabel, translate, translateServerMessage } from '../../i18n';

test('nenhum texto visível em inglês nas telas em português', () => {
  const found = findEnglishUiText();
  const report = found.map(f => `  ${f.file}:${f.line}  "${f.text}"  [${f.words.join(', ')}]`).join('\n');
  assert.equal(found.length, 0, `Texto em inglês encontrado na interface:\n${report}`);
});

test('o detector reconhece inglês e aceita português', () => {
  for (const text of ['Loading...', 'Save changes', 'Something went wrong', 'Please try again', 'Cancel']) {
    assert.ok(englishWordsIn(text).length > 0, `deveria detectar: ${text}`);
  }
  for (const text of ['Carregando...', 'Salvar alterações', 'Total', 'Status do contrato', 'E-mail', 'Pix', 'Times New Roman', '2 contrato(s) adicional(is)']) {
    assert.deepEqual(englishWordsIn(text), [], `não deveria detectar: ${text}`);
  }
});

test('dicionário em português não contém inglês', () => {
  const leaks = Object.entries(ptBR).filter(([, value]) => englishWordsIn(value).length > 0);
  assert.deepEqual(leaks, []);
});

test('inglês e espanhol têm exatamente as mesmas chaves do português', () => {
  const keys = Object.keys(ptBR).sort();
  assert.deepEqual(Object.keys(en).sort(), keys);
  assert.deepEqual(Object.keys(es).sort(), keys);
  for (const [key, value] of [...Object.entries(en), ...Object.entries(es)]) assert.ok(value.trim(), `tradução vazia: ${key}`);
});

test('menus nunca exibem o código interno da tela', () => {
  for (const code of ['SUPPORT', 'REPORTS', 'SETTINGS', 'FLOW', 'CODIGO_INEXISTENTE']) {
    assert.notEqual(navLabel(code, { lang: 'pt-BR' }), code);
  }
  assert.equal(navLabel('MY_WALLET', { short: true, lang: 'pt-BR' }), 'Carteira');
  assert.equal(navLabel('MY_WALLET', { lang: 'en' }), 'My Wallet');
  for (const file of ['layout/HeaderBar.tsx', 'layout/BottomNav.tsx', 'pages/ProfilePage.tsx']) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /default:\s*return tab;|\?\?\s*tab;/, `${file} voltou a exibir o código interno da aba`);
  }
});

test('erros técnicos em inglês viram mensagens claras no idioma escolhido', () => {
  assert.equal(translateServerMessage('TypeError: Failed to fetch', 'pt-BR'), translate('errors.network', undefined, 'pt-BR'));
  assert.equal(translateServerMessage('Invalid login credentials', 'pt-BR'), 'E-mail ou senha incorretos.');
  assert.equal(translateServerMessage('new row violates row-level security policy', 'pt-BR'), translate('errors.permission', undefined, 'pt-BR'));
  assert.equal(translateServerMessage('duplicate key value violates unique constraint', 'es'), translate('errors.duplicate', undefined, 'es'));
  assert.equal(translateServerMessage('Unexpected error while processing', 'pt-BR'), translate('errors.generic', undefined, 'pt-BR'));
  assert.equal(translateServerMessage('Saldo insuficiente na conta.', 'pt-BR'), 'Saldo insuficiente na conta.');
  assert.equal(translateServerMessage('', 'pt-BR'), translate('errors.generic', undefined, 'pt-BR'));
});

test('avisos de erro passam pelo tradutor e o seletor de idioma está no Perfil', () => {
  assert.match(readFileSync('hooks/useToast.ts', 'utf8'), /translateServerMessage\(rawMsg\)/);
  assert.match(readFileSync('pages/ProfilePage.tsx', 'utf8'), /<LanguageSelector /);
  assert.match(readFileSync('index.html', 'utf8'), /<html lang="pt-br"/i);
});
