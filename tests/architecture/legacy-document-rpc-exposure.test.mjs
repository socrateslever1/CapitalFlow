import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql=readFileSync('supabase/migrations/20261103210000_revoke_unsafe_legacy_document_rpc_grants.sql','utf8');
const blocked=[
 'portal_update_doc_fields(uuid,jsonb)',
 'portal_sign_document(uuid,text,text,text,text)',
 'portal_sign_document(uuid,text,text,text,text,text)',
 'portal_sign_document(uuid,uuid,text,text,text,text,text)',
 'portal_get_doc(uuid,uuid)',
 'portal_get_document_by_token(uuid,text)',
];
test('proíbe as assinaturas legadas sem credenciais, preservando service_role',()=>{
  for(const signature of blocked) {
    assert.ok(sql.includes('REVOKE EXECUTE ON FUNCTION public.'+signature+' FROM PUBLIC, anon, authenticated;'),signature);
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.'+signature+' TO service_role;'),signature);
  }
  assert.ok(sql.includes('pg_get_functiondef'));
  assert.ok(sql.includes('expected_md5'));
});
test('não modifica dados nem desabilita as rotas vigentes com token + código',()=>{
  assert.doesNotMatch(sql,/\b(?:DELETE\s+FROM|UPDATE\s+public\.|DROP\s+(?:FUNCTION|TABLE)|TRUNCATE)\b/i);
  assert.ok(!sql.includes('REVOKE EXECUTE ON FUNCTION public.portal_get_doc(text,text,uuid)'));
  assert.ok(!sql.includes('REVOKE EXECUTE ON FUNCTION public.portal_sign_document(text,text,uuid,'));
  assert.ok(sql.includes('Current portal RPC not public'));
});
test('bloqueia anônimos e mantém titulares autenticados na geração de acesso',()=>{
  assert.ok(sql.includes('REVOKE EXECUTE ON FUNCTION public.ensure_client_portal_access(uuid) FROM PUBLIC, anon;'));
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.ensure_client_portal_access(uuid) TO authenticated, service_role;'));
});
test('revoga somente sobrecargas antigas e mantém as rotas atuais com token + código', () => {
  const sql = readFileSync('supabase/migrations/20261103233500_revoke_legacy_onefactor_portal_rpc.sql', 'utf8');
  for (const signature of [
    'portal_get_doc(text,uuid)', 'portal_list_docs(uuid)',
    'portal_registrar_intencao(uuid,text,text)',
    'sync_client_data_to_contracts()', 'sync_mutuo_pre_desembolso_signature_status()',
  ]) {
    assert.ok(sql.includes('REVOKE EXECUTE ON FUNCTION public.' + signature), signature);
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.' + signature + ' TO service_role;'), signature);
  }
  assert.ok(sql.includes('definition_md5'), 'Verificar que a função ainda é a mesma');
  assert.ok(sql.includes('portal_get_doc(text,text,uuid)'));
  assert.ok(sql.includes('portal_list_docs(text,text)'));
  assert.ok(!sql.includes('REVOKE EXECUTE ON FUNCTION public.portal_get_doc(text,text,uuid)'));
  assert.doesNotMatch(sql, /\b(?:DELETE|TRUNCATE|DROP\s+FUNCTION)\b/i);
});
