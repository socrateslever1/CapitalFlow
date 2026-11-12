import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Salvar alterações inclui vínculo e só fecha após confirmação da RPC', () => {
  const page=readFileSync('pages/SourcesPage.tsx','utf8');
  const editor=readFileSync('components/sources/SourceWalletReferencePanel.tsx','utf8');
  const handler=page.slice(page.indexOf('const saveSourceEdit'),page.indexOf('  return (\n    <div'));
  assert.match(handler,/await saveOriginsRef\.current\(\)/);
  assert.match(handler,/if \(saveOriginsRef\.current && !\(await saveOriginsRef\.current\(\)\)\) return;/);
  assert.match(page,/saveRef=\{saveOriginsRef\}/);
  assert.match(editor,/\.eq\('source_id', source\.id\)/);
  assert.match(editor,/persistedKeys\.some/);
  assert.match(editor,/setSaved\(persistedRows\)/);
  assert.doesNotMatch(editor,/Informar valor/);
  assert.doesNotMatch(editor,/type="text" inputMode="decimal"/);
  // Desde 729d627 o valor alocado não é mais zerado: só é preservado a partir do vínculo já persistido
  // (nunca digitado na interface). Novos vínculos continuam sem valor alocado.
  const payload=editor.slice(editor.indexOf('origins.push({'),editor.indexOf('});',editor.indexOf('origins.push({')));
  assert.match(payload,/allocated_amount: previous\?\.allocated_amount \?\? null/);
  assert.equal((payload.match(/allocated_amount:/g)||[]).length,1);
});

test('uma única ação de confirmação e atualização da lista',()=>{
  const page=readFileSync('pages/SourcesPage.tsx','utf8');
  const editor=readFileSync('components/sources/SourceWalletReferencePanel.tsx','utf8');
  assert.equal((page.match(/'Salvar alterações'/g)||[]).length,1);
  assert.doesNotMatch(editor,/>Salvar origens</);
  assert.match(editor,/capitalflow:source-origins-updated/);
});

test('origens antigas não são removidas automaticamente e a distinção de cartão é explícita', () => {
  const editor = readFileSync('components/sources/SourceWalletReferencePanel.tsx', 'utf8');
  assert.match(editor, /Cartão antigo não localizado na Minha Carteira/);
  assert.match(editor, /Conta antiga não localizada na Minha Carteira/);
  assert.match(editor, /Vínculo antigo mantido/);
  assert.match(editor, /Fontes de capital do tipo cartão/);
  assert.match(editor, /const previous = saved\.find/);
  assert.match(editor, /allocated_amount: previous\?\.allocated_amount \?\? null/);
  assert.doesNotMatch(editor, /Remova o recurso indisponível antes de salvar/);
});
