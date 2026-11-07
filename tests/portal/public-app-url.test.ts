import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildPublicAppUrl, getPublicAppOrigin, normalizeShareableAppUrl } from '../../utils/publicAppUrl';
test('Android localhost never becomes public portal or registration URL',()=>{
  assert.equal(getPublicAppOrigin(),'https://capflow.pages.dev');
  const portal=buildPublicAppUrl('/',{portal:'00000000-0000-4000-8000-000000000001',portal_code:'123456'});
  assert.equal(new URL(portal).origin,'https://capflow.pages.dev');
  assert.equal(new URL(portal).searchParams.get('portal_code'),'123456');
  assert.equal(normalizeShareableAppUrl('https://localhost/?portal=x&portal_code=123456'),
    'https://capflow.pages.dev/?portal=x&portal_code=123456');
  assert.equal(normalizeShareableAppUrl('http://127.0.0.1:5173/?cadastro=x'),
    'https://capflow.pages.dev/?cadastro=x');
});
test('Third-party signed storage URLs are preserved and unsafe links rejected',()=>{
  const signed='https://example.supabase.co/storage/v1/object/sign/a.pdf?token=abc';
  assert.equal(normalizeShareableAppUrl(signed),signed);
  assert.equal(normalizeShareableAppUrl('javascript:alert(1)'),null);
  assert.equal(normalizeShareableAppUrl('file:///etc/passwd'),null);
  assert.equal(normalizeShareableAppUrl('http://evil.test/?portal=x'),null);
  assert.throws(()=>buildPublicAppUrl('//evil.test',{portal:'x'}));
});
test('Portal, client registration and public legal links never use private WebView origin',()=>{
  for (const path of [
    'utils/portalLink.ts','pages/ClientsPage.tsx',
    'services/clientLegalDocuments.service.ts','services/clientRegistration.service.ts',
    'features/legal/services/legalPublic.service.ts',
    'features/legal/components/LegalDocumentModal.tsx',
    'features/legal/components/LegalDocumentViewer.tsx',
    'features/legal/components/ConfissaoDivida/useConfissaoDividaState.ts',
    'pages/DossierPage.tsx',
  ]) {
    const content=readFileSync(path,'utf8');
    assert.doesNotMatch(content,/window\.location\.origin/,path);
    assert.match(content,/buildPublicAppUrl|normalizeShareableAppUrl/,path);
  }
});
