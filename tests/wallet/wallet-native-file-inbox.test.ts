import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { PersonalWalletAccount, PersonalWalletCard } from '../../services/personalWallet.service';
import { suggestWalletDestination } from '../../features/wallet/nativeWalletFileInbox';

const card = (id:string, last_four:string) =>
  ({id, last_four, issuer:'Nubank',nickname:'Nubank '+id,status:'ACTIVE'} as PersonalWalletCard);
const account = (id:string) =>
  ({id,nickname:'Nubank '+id,bank_name:'Nubank'} as PersonalWalletAccount);

test('OFX card with bank and last four can suggest the unique matching card', () => {
  const header='<OFX><CCSTMTRS><CCACCTFROM><ACCTID>5555444433334567</ACCTID><ORG>Nubank';
  const result=suggestWalletDestination('fatura.ofx',header,[],[card('a','1234'),card('b','4567')]);
  assert.equal(result?.targetId,'b');
  assert.equal(result?.kind,'CARD');
});

test('two cards with same bank cannot be guessed without a unique account identifier', () => {
  const header='<OFX><CCSTMTRS><ORG>Nubank';
  assert.equal(suggestWalletDestination('fatura.ofx',header,[],[card('a','1234'),card('b','4567')]),null);
  assert.equal(suggestWalletDestination('desconhecido.ofx','<OFX>',[],[card('a','1234')]),null);
});

test('one account for known bank is preselected, two similar accounts require manual choice', () => {
  const header='<OFX><STMTRS><ORG>Nubank';
  assert.equal(suggestWalletDestination('extrato.ofx',header,[account('a')],[])?.targetId,'a');
  assert.equal(suggestWalletDestination('extrato.ofx',header,[account('a'),account('b')],[]),null);
});

test('received Android files require review before financial writes', () => {
  const native=readFileSync('native/android/WalletFileInboxPlugin.java','utf8');
  const activity=readFileSync('native/android/MainActivity.java','utf8');
  const build=readFileSync('scripts/android/apply-native-shell.py','utf8');
  const inbox=readFileSync('features/wallet/NativeWalletFileInbox.tsx','utf8');
  const reader=readFileSync('components/wallet/FlatSmartStatementReader.tsx','utf8');
  const launcher=readFileSync('main.tsx','utf8');
  for(const mime of ['application/pdf','application/x-ofx','application/vnd.intu.qfx','application/octet-stream'])
    assert(build.includes(mime));
  assert(build.includes('android.intent.action.VIEW'));
  assert(build.includes('android.intent.action.SEND'));
  assert(build.includes('WalletFileInboxPlugin.java'));
  assert(activity.includes('registerPlugin(WalletFileInboxPlugin.class)'));
  assert(activity.includes('onNewIntent(Intent intent)'));
  assert(native.includes('MAX_BYTES = 10 * 1024 * 1024'));
  assert(native.includes('getParcelableExtra(Intent.EXTRA_STREAM)'));
  assert(native.includes('openInputStream(uri)'));
  assert(native.includes('allowedName('));
  assert(inbox.includes('Ler documento e conferir lançamentos'));
  assert(inbox.includes('Conferência') || inbox.includes('conferência') || inbox.includes('conferir'));
  assert(inbox.includes('initialFile={file}'));
  assert(reader.includes('initialFile?: File'));
  assert(launcher.includes('<NativeWalletImportRouter />'));
  assert(!inbox.includes('personalWalletService.recordStatementRow('),
    'external file inbox must never write transactions without review');
});

test('network access failure is recoverable, without authorizing previously unknown sessions', () => {
  const access=readFileSync('features/wallet/hooks/useWalletAccess.ts','utf8');
  const module=readFileSync('features/wallet/WalletModule.tsx','utf8');
  assert(access.includes("window.addEventListener('online', onFocus)"));
  assert(access.includes("previous.status === 'active' && network"));
  assert(access.includes('retry: () => void'));
  assert(module.includes('onRetry={access.retry}'));
  assert(!module.includes('TypeError: Failed to fetch'));
});

test('Android bank picker is a constrained select and no longer a native datalist', () => {
  const accounts=readFileSync('components/wallet/CreateAccountModal.tsx','utf8');
  assert(!accounts.includes('<datalist id="create-account-institutions">'));
  assert(accounts.includes('aria-label="Selecionar instituição bancária"'));
  assert(accounts.includes('Outro banco ou instituição'));
  assert(accounts.includes('Nome de outro banco'));
});
