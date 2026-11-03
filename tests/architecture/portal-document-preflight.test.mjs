import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20261103214000_portal_document_signing_preflight.sql', 'utf8');
const portal = readFileSync('services/portal.service.ts', 'utf8');
const legal = readFileSync('services/legalDocument.service.ts', 'utf8');
const viewer = readFileSync('pages/Portal/DocumentViewer.tsx', 'utf8');
const logic = readFileSync('features/portal/hooks/useClientPortalLogic.ts', 'utf8');

test('validação de assinatura não autoriza automaticamente nem por documento sem credenciais', () => {
  assert.doesNotMatch(migration, /'can_sign',\s*true/);
  assert.match(migration, /portal_document_signing_check_v1\(p_token, p_shortcode, p_documento_id\)/);
  assert.match(migration, /c\.id=d\.loan_id/);
  assert.match(migration, /c\.portal_shortcode=p_shortcode/);
  assert.match(migration, /d\.profile_id=c\.owner_id/);
  assert.match(migration, /portal_burned_at IS NULL/);
  assert.match(migration, /coalesce\(v_doc\.status_assinatura/);
  assert.match(migration, /legal_document_missing_fields_v1/);
  assert.match(migration, /expected_md5|pg_get_functiondef/);
});

test('assinatura pública do portal vincula identidade e evita representação de terceiros', () => {
  assert.match(migration, /IF v_role <> 'DEBTOR' THEN/);
  assert.match(migration, /v_expected_document/);
  assert.match(migration, /v_expected_name/);
  assert.match(migration, /p_portal_token <> v_token_uuid/);
  assert.match(migration, /p_document_version <> v_expected_version::text/);
  assert.match(migration, /signed_at = coalesce\(signed_at, now\(\)\)/);
  assert.doesNotMatch(migration, /DELETE FROM public\.documentos_juridicos/i);
});

test('front-end sempre envia token e código e não confunde falha com assinatura concluída', () => {
  assert.match(portal, /rpc\('portal_document_signing_check_v1'/);
  assert.match(legal, /rpc\('portal_document_signing_check_v1'/);
  assert.match(portal, /\(data as any\)\.success !== true/);
  assert.match(legal, /confirmation\.success !== true/);
  assert.match(viewer, /missingFields\(token, code, docId\)/);
  assert.match(logic, /docMissingFields\(initialToken, initialCode, docId\)/);
  assert.doesNotMatch(viewer, /<option value="CREDOR">/);
});

test('RPC antiga exige proprietário autenticado e a pública usa dois fatores', () => {
  assert.match(migration, /auth\.uid\(\) IS NULL/);
  assert.match(migration, /p\.user_id=auth\.uid\(\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.rpc_doc_missing_fields\(uuid\) FROM PUBLIC,anon,authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.portal_document_signing_check_v1\(text,text,uuid\) TO anon,authenticated,service_role/);
});
