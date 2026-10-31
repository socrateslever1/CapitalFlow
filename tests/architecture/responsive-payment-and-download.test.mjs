import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const modal=readFileSync('components/ui/Modal.tsx','utf8');
const offer=readFileSync('components/cards/components/PaymentOfferModal.tsx','utf8');
const web=readFileSync('components/system/AppUpdateBanner.tsx','utf8');
const native=readFileSync('components/system/AndroidNativeUpdateNotice.tsx','utf8');
const browser=readFileSync('components/system/AndroidApkNotice.tsx','utf8');

test('payment condition keeps three real actions responsive, no forced 320px width',()=>{
  assert.match(offer,/size="lg" busy=\{isSaving\}/);
  assert.match(offer,/footerMode="custom"/);
  assert.match(offer,/grid-cols-2 gap-2 sm:grid-cols-3/);
  assert.match(offer,/col-span-2.*sm:col-span-1/);
  assert.match(offer,/min-h-12/);
  for(const label of ['Voltar','Enviar para o portal','Cancelar condição ativa']){
    assert.ok(offer.includes(label),label);
  }
  assert.match(modal,/footerMode\?: 'default' \| 'custom'/);
  assert.match(modal,/footerMode === 'default'/);
  assert.match(modal,/sm:max-h-\[min\(90dvh,960px\)\]/);
  assert.match(modal,/min-h-0/);
  assert.match(modal,/\[padding-bottom:max\(0\.875rem,env\(safe-area-inset-bottom\)\)\]/);
  assert.ok(!modal.includes("sm: 'max-w-[320px]'"));
});
test('browser gets only web-refresh, Android web can download APK in site and native gets APK installer',()=>{
  assert.match(web,/Capacitor\.isNativePlatform\(\)/);
  assert.match(web,/Atualizar página/);
  assert.match(native,/await apkInstaller\.downloadAndInstall\(\)/);
  assert.match(native,/Capacitor\.getPlatform\(\) !== 'android'/);
  assert.match(browser,/isAndroidSaaSBrowser/);
  assert.match(browser,/ANDROID_APK_DOWNLOAD_URL = '\/api\/android\/apk'/);
  assert.match(browser,/download="CapitalFlow-Android\.apk"/);
  assert.doesNotMatch(browser,/target="_blank"/);
  // Copy de UX não deve conter instruções internas da implementação.
  assert.match(browser,/Instale o CapitalFlow no seu celular e acesse o sistema pelo aplicativo\./);
  assert.equal((browser.match(/Baixar aplicativo/g) || []).length, 2);
  assert.doesNotMatch(browser,/O arquivo será baixado pelo próprio site|sem abrir outra página|Baixar sem sair do CapitalFlow/);
});
test('Cloudflare binary proxy enforces official immutable URL, HTTPS, max size, download disposition',()=>{
  const proxy=readFileSync('functions/api/android/apk.ts','utf8');
  assert.match(proxy,/https:\/\/github\.com\/socrateslever1\/CapitalFlow\/releases\/download\/android-signed-beta\/CapitalFlow-Android\.apk/);
  assert.match(proxy,/MAX_APK_BYTES/);
  assert.match(proxy,/contentLength > MAX_APK_BYTES/);
  assert.match(proxy,/protocol !== 'https:'/);
  assert.match(proxy,/Content-Disposition/);
  assert.match(proxy,/new Response\(bounded/);
  assert.doesNotMatch(proxy,/302|status:\s*3\d\d/);
  const serviceWorker=readFileSync('public/service-worker.js','utf8');
  assert.match(serviceWorker,/url\.pathname === '\/api\/android\/apk'/);
  assert.match(serviceWorker,/if \(isSameOrigin && url\.pathname === '\/api\/android\/apk'\) return/);

});

test('wallet card footer keeps Cancel and Save in separate equal-width responsive cells', () => {
  const page = readFileSync('features/wallet/pages/WalletCardsPage.tsx','utf8');
  assert.match(page, /title="Novo cartão"[\s\S]+?footer=\{<button[^>]+form="new-wallet-card-form"/);
  assert.match(modal, /footer && footerMode === 'default' \? 'sm:grid-cols-2'/);
  assert.match(modal, /data-modal-footer-actions/);
  assert.match(modal, /sm:col-start-2 sm:row-start-1/);
  assert.match(modal, /sm:col-start-1 sm:row-start-1/);
  assert.match(modal, /\[&>\*\]:min-w-0 \[&>\*\]:max-w-full/);
  assert.doesNotMatch(modal, /sm:flex-row-reverse|sm:flex-1/);
  assert.match(modal, /footerMode === 'default' && <button/);
});
