import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const service=readFileSync('services/legalDocument.service.ts','utf8');
const legal=readFileSync('pages/LegalPage.tsx','utf8');
const migration=readFileSync('supabase/migrations/20261111165000_legal_document_safe_archive.sql','utf8');

test('exclusão jurídica não usa portal anônimo nem confirma delete sem retorno',()=>{
  const method=service.slice(service.indexOf('async deleteDoc('));
  assert.doesNotMatch(method,/supabasePortal\.from\('documentos_juridicos'\)/);
  assert.match(method,/supabase\.auth\.getUser\(\)/);
  assert.match(method,/\.eq\('user_id',session\.user\.id\)/);
  assert.match(method,/count > 0/);
  assert.match(method,/\.(?:select)\('id'\)/);
  assert.match(method,/deleted\.length !== 1/);
});
test('arquivo conserva documento original, exige titular autenticado e RLS',()=>{
  assert.match(service,/async archiveDoc\(/);
  assert.match(service,/async restoreDoc\(/);
  assert.match(service,/async listArchivedDocIds\(/);
  assert.match(migration,/ENABLE ROW LEVEL SECURITY/);
  assert.match(migration,/p\.user_id=\(SELECT auth\.uid\(\)\)/);
  assert.match(migration,/owner_auth_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(migration,/assinaturas_documento/);
  assert.match(migration,/OLD\.locked_at IS NOT NULL/);
  assert.match(migration,/OLD\.status_assinatura IS DISTINCT FROM 'PENDENTE'/);
  assert.doesNotMatch(migration,/DELETE FROM public\.documentos_juridicos/i);
});
test('jurídico mostra diferença entre arquivo e exclusão, sem ação falsa',()=>{
  assert.match(legal,/listArchivedDocIds/);
  assert.match(legal,/handleArchiveDocument/);
  assert.match(legal,/handleRestoreDocument/);
  assert.match(legal,/handleDeleteDocument/);
  assert.match(legal,/Documento gerado no sistema/);
  assert.doesNotMatch(legal,/documento do sistema.*irreversível/i);
});
