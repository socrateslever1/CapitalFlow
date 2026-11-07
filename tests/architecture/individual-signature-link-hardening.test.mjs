import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/20261103223000_harden_individual_signature_links.sql','utf8');
const client = readFileSync('features/legal/services/legalPublic.service.ts','utf8');

test('locks the document row before checking signature state and writing', () => {
  const lock = sql.indexOf('FOR UPDATE;');
  const existing = sql.indexOf('IF v_role=ANY(v_signed_roles)');
  const insert = sql.indexOf('INSERT INTO public.assinaturas_documento');
  assert.ok(lock > 0 && existing > lock && insert > existing);
  assert.match(sql,/status_assinatura,''\)\) NOT IN \('PENDENTE','EM_ASSINATURA'\)/);
  assert.match(sql,/locked_at IS NOT NULL/);
  assert.match(sql,/token_expires_at/);
  assert.match(sql,/ux_documentos_juridicos_view_token_v1/);
});

test('enforces ownership or active registration and disallows unbound legacy drafts', () => {
  assert.match(sql,/c\.id=v_doc\.loan_id/);
  assert.match(sql,/c\.owner_id=v_doc\.profile_id/);
  assert.match(sql,/v_doc\.client_id=c\.client_id/);
  assert.match(sql,/portal_status_allows_access/);
  assert.match(sql,/v_doc\.registration_link_id IS NULL OR NOT EXISTS/);
  assert.match(sql,/r\.profile_id=v_doc\.profile_id AND r\.active/);
  assert.match(sql,/Documento sem vínculo válido para assinatura/);
});

test('binds all signer roles to document identities, not URL role parameters alone', () => {
  for(const field of ['debtorName','debtorDoc','creditorName','creditorDoc','avalistaCpf','witnesses','requiredSignatureRoles']) {
    assert.ok(sql.includes(field),field);
  }
  assert.match(sql,/v_doc_digits<>v_input_digits/);
  assert.match(sql,/upper\(btrim\(v_expected_name\)\) <> upper/);
  assert.match(sql,/v_role=ANY\(v_required_roles\)/);
  assert.match(sql,/length\(v_doc_digits\) NOT IN \(11,14\)/);
  assert.match(sql,/legal_document_missing_fields_v1\(v_doc\.snapshot\)/);
});

test('rejects invalid hashes and ambiguous roles, preserves existing rows', () => {
  assert.match(sql,/p_hash_assinado,''\) !~\* '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(sql,/legacy|identidade|assinatura|role/i);
  assert.doesNotMatch(sql,/\bDELETE\s+FROM\s+public\.|\bTRUNCATE\s+public\./i);
  assert.match(sql,/pg_get_functiondef/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.sign_documento_juridico_by_view_token/);
});

test('the frontend requires an explicit successful server acknowledgement', () => {
  assert.match(client,/rpcPayload\?\.success !== true/);
});
