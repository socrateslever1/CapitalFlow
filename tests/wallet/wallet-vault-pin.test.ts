import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {normalizeBankSearch,bankSuggestionHeight} from '../../components/wallet/walletBankComboboxDomain';
import {BANK_CATALOG} from '../../utils/bankLogoRegistry';
import {
  createWalletMasterPin, unlockWalletMasterPin,
  encryptCardWithMaster, decryptCardWithMaster,
} from '../../features/wallet/domain/cardVault';
import {
  cacheWalletVaultKey, clearWalletVaultSession, getWalletVaultKey,
} from '../../features/wallet/domain/walletVaultSession';

const owner='10000000-0000-4000-8000-000000000001';
const cardId='20000000-0000-4000-8000-000000000001';
const data={number:'4111111111111111',securityCode:'123'};

test('one PIN wraps a random AES-256 master key; no PAN/PIN/CVC leaks in stored envelopes',async()=>{
  const pin='12345678';
  const {profile,key}=await createWalletMasterPin(pin);
  assert.equal(key.extractable,false);
  assert.equal(profile.version,1);
  assert.equal(profile.iterations,600000);
  assert.ok(!JSON.stringify(profile).includes(pin));
  assert.ok(!JSON.stringify(profile).includes(data.number));
  const envelope=await encryptCardWithMaster(data,key,owner,cardId);
  assert.equal(envelope.version,2);
  assert.ok(!JSON.stringify(envelope).includes(data.number));
  assert.ok(!JSON.stringify(envelope).includes(data.securityCode));
  assert.deepEqual(await decryptCardWithMaster(envelope,key,owner),{...data,securityCode:''});
  const restored=await unlockWalletMasterPin(profile,pin);
  assert.equal(restored.extractable,false);
  assert.deepEqual(await decryptCardWithMaster(envelope,restored,owner),{...data,securityCode:''});
  await assert.rejects(unlockWalletMasterPin(profile,'87654321'),/PIN incorreto/);
  await assert.rejects(decryptCardWithMaster(envelope,restored,'another-owner'),/Não foi possível/);
  await assert.rejects(decryptCardWithMaster({...envelope,context_id:'30000000-0000-4000-8000-000000000001'},restored,owner),/Não foi possível/);
});
test('PIN is numeric and requires at least eight digits',async()=>{
  for(const bad of ['123456','abcdefgh','1234567890123','']) {
    await assert.rejects(createWalletMasterPin(bad),/PIN/);
  }
});
test('vault cache contains non-extractable key only and clears explicitly',async()=>{
  const {key}=await createWalletMasterPin('98765432');
  cacheWalletVaultKey(owner,key);
  assert.equal(getWalletVaultKey(owner),key);
  assert.equal(getWalletVaultKey('unrelated-owner'),null);
  assert.equal(getWalletVaultKey(owner),null);
  cacheWalletVaultKey(owner,key);
  clearWalletVaultSession();
  assert.equal(getWalletVaultKey(owner),null);
});
test('RPC uses owner checks, RLS, no plain card data and does not allow anonymous users',()=>{
  const sql=readFileSync('supabase/migrations/20261030192500_wallet_master_pin_vault.sql','utf8');
  for(const token of [
    'ENABLE ROW LEVEL SECURITY','SECURITY DEFINER',
    'public.is_platform_super_admin()', 'auth.uid()',
    'GRANT EXECUTE ON FUNCTION public.personal_wallet_get_card_vault',
    'GRANT EXECUTE ON FUNCTION public.personal_wallet_get_pin_profile',
    'REVOKE ALL ON public.personal_wallet_card_vault FROM PUBLIC, anon, authenticated',
  ])assert.ok(sql.includes(token),token);
  const modal=readFileSync('components/wallet/CardVaultModal.tsx','utf8');
  assert.ok(modal.includes('CardProtectedFields value={draft} onChange={setDraft} askPassword={false}'));
  assert.ok(modal.includes('cacheWalletVaultKey'));
  assert.ok(modal.includes('clearWalletVaultSession'));
  assert.ok(modal.includes('PIN da Carteira'));
  assert.ok(!modal.includes('encryptCardData('),'new card must use the master key');
  assert.ok(modal.includes('decryptCardData('),'old card must remain decryptable');
});


test('basic card creation remains passwordless and offers encrypted details afterward',()=>{
  const page=readFileSync('features/wallet/pages/WalletCardsPage.tsx','utf8');
  const basic=page.slice(page.indexOf('{creating && <Modal'),page.indexOf('{mayInitializeExisting &&'));
  assert.ok(basic.includes('Depois de salvar, adicionar o número completo'));
  assert.ok(basic.includes('Apenas o banco é obrigatório'));
  assert.ok(!basic.includes('CardProtectedFields'));
  assert.ok(page.includes('if(addProtectedAfterCreate && createdCardId)'));
  assert.ok(page.includes('setVaultCard({'));
  assert.ok(page.includes('setCreating(false)'));
});

test('bank lookup ignores case and accents while preserving typed text',()=>{
  assert.equal(normalizeBankSearch(' ITAÚ '), 'itau');
  const results=BANK_CATALOG.filter(bank=>normalizeBankSearch(bank.name).includes(normalizeBankSearch('nUbAnK')));
  assert.ok(results.length>0,'Nubank should be searchable');
  assert.ok(results.some(bank=>normalizeBankSearch(bank.name).includes('nubank')));
  assert.equal(normalizeBankSearch('Mercado PÁGO'), 'mercado pago');
});
test('suggestions stay above the Android keyboard and inside the modal scroll body',()=>{
  assert.equal(bankSuggestionHeight(320,800,500),168,'limited by modal body, not physical screen');
  assert.equal(bankSuggestionHeight(320,400,700),68,'limited by visible keyboard viewport');
  assert.equal(bankSuggestionHeight(320,350,800),0,'do not overlay keyboard when no room');
  assert.equal(bankSuggestionHeight(100,900,900),224,'bound list height');
  assert.equal(bankSuggestionHeight(NaN,800,800),0,'invalid geometry closes suggestions');
});
test('card form and vault are isolated from account autofill and global credential prompts',()=>{
  const page=readFileSync('features/wallet/pages/WalletCardsPage.tsx','utf8');
  const combobox=readFileSync('components/wallet/WalletBankCombobox.tsx','utf8');
  const protectedFields=readFileSync('components/wallet/CardProtectedFields.tsx','utf8');
  const modal=readFileSync('components/wallet/CardVaultModal.tsx','utf8');
  const form=page.slice(page.indexOf('{creating && <Modal'),page.indexOf('{mayInitializeExisting &&'));
  assert.ok(form.includes('<WalletBankCombobox'));
  assert.ok(!form.includes('<datalist'));
  assert.ok(!form.includes('issuer:v.issuer||matched'),'linked account cannot override issuer');
  assert.ok(!page.includes('cardholder_name: ownerDefaults.name'),'printed name is user-controlled');
  assert.ok(combobox.includes('window.visualViewport'));
  assert.ok(combobox.includes("closest('[data-dialog-body]')"));
  assert.ok(combobox.includes('role="combobox"'));
  assert.ok(combobox.includes('role="listbox"'));
  assert.ok(combobox.includes('onBlur='));
  assert.ok(combobox.includes("event.key === 'Escape'"));
  assert.ok(protectedFields.includes('não é solicitado nem armazenado'));
  assert.ok(!protectedFields.includes('value={value.securityCode}'));
  assert.ok(!modal.includes("['CVC',draft.securityCode]"));
  assert.ok(modal.includes('setRetry(value=>value+1)'),'reload vault after Android backgrounding');
  assert.ok(modal.includes('A sessão mudou ou não tem autorização'));
});
