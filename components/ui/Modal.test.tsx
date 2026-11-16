import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { Modal } from './Modal';
import { LoanFormActions } from '../forms/LoanFormActions';

test('cartão mantém conteúdo e ação externa ligada ao formulário', () => {
  const html = renderToStaticMarkup(<Modal onClose={() => {}} title="Cadastro" size="xl" footer={<LoanFormActions formId="contract" isSubmitting={false} isEditing={false} />}><form id="contract"><input required name="client" /></form></Modal>);
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /data-dialog-body/);
  assert.match(html, /form="contract" type="submit"/);
  assert.equal((html.match(/Emitir Contrato/g) || []).length, 1);
  assert.match(html, /Cancelar/);
});

test('ocupado bloqueia edição e cancelamento sem remover dados', () => {
  const html = renderToStaticMarkup(<Modal onClose={() => {}} title="Pagamento" busy><input defaultValue="125,00" /></Modal>);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /fieldset disabled=""/);
  assert.match(html, /value="125,00"/);
  assert.match(html, /button type="button" disabled=""/);
});

test('variante wallet aplica janela suspensa com margem, safe-area e rolagem interna sem alterar modais padrão', () => {
  const defaultHtml = renderToStaticMarkup(<Modal onClose={() => {}} title="Padrão"><div>Conteúdo</div></Modal>);
  const walletHtml = renderToStaticMarkup(<Modal variant="wallet" onClose={() => {}} title="Carteira" footer={<button type="submit">Confirmar</button>}><div>Conteúdo</div></Modal>);
  assert.match(defaultHtml, /data-modal-variant="default"/);
  assert.match(walletHtml, /data-modal-variant="wallet"/);
  assert.match(walletHtml, /p-3/);
  assert.match(walletHtml, /safe-area-inset-top/);
  assert.match(walletHtml, /safe-area-inset-bottom/);
  assert.match(walletHtml, /data-dialog-body/);
  assert.match(walletHtml, /Confirmar/);
  assert.match(walletHtml, /Cancelar/);
});
