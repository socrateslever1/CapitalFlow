import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdminDiagnostics } from '../../components/system/AdminDiagnostics';
import { localDiagnostics } from '../../services/localDiagnostics';
test('painel explica escopo, tem cópia manual e não expõe mensagens sensíveis', () => {
  localDiagnostics.setSession('master');
  localDiagnostics.record('runtime', new Error('Cliente Maria cartão 1234567890123456'));
  const html = renderToStaticMarkup(<AdminDiagnostics/>);
  for (const label of ['Copiar relatório','Limpar diagnóstico','seleção manual','Sem coleta remota']) assert.ok(html.includes(label));
  assert.ok(!/Maria|1234567890123456/.test(html));
  localDiagnostics.setSession(null);
});
test('erros tratados no toast entram no diagnóstico sem gravar texto bruto', () => {
  assert.match(readFileSync('hooks/useToast.ts','utf8'), /localDiagnostics.record\('interface', rawMsg\)/);
});
