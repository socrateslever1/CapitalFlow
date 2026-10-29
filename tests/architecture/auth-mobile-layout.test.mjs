import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const auth = readFileSync('features/auth/AuthScreen.tsx', 'utf8');
const login = auth.slice(auth.indexOf('const LoginView ='), auth.indexOf('/**\n * 4. COMPONENTE PRINCIPAL'));

test('mobile login is centered, scrollable and keeps system safe-area padding', () => {
  assert(auth.includes('cf-auth-viewport relative flex min-h-[100dvh] w-full items-center justify-center'));
  const css = readFileSync('index.css', 'utf8');
  assert(css.includes('100dvh - env(safe-area-inset-top'));
  assert(css.includes('env(safe-area-inset-bottom'));
  assert(css.includes('justify-content: safe center'), 'oversized login must not clip its top edge');
  assert(css.includes('margin-block: auto'), 'tall viewports center the form');
  assert(auth.includes('max-w-sm flex-col justify-center rounded-2xl'));
  assert(auth.includes('aria-label="Abrir ajuda"'));
  assert(auth.includes('absolute right-3 top-3 z-20'), 'help control stays within the card');
});

test('inputs, password eye and authentication buttons fit responsive rows', () => {
  assert.equal((login.match(/min-h-\[56px\]/g) || []).length, 2, 'email/password same height');
  assert(login.includes('min-w-0 flex-1 bg-transparent text-base'), 'fields do not overflow on phones');
  assert(login.includes('autoComplete="email"'));
  assert(login.includes('autoComplete="current-password"'));
  assert(login.includes('aria-label={showPassword ?'));
  assert(!login.includes('absolute right-4 text-slate-500'), 'password eye is not overlayed on text');
  assert.equal((login.match(/min-h-12 w-full/g) || []).length, 3, 'two entry buttons and demo same mobile height');
  assert(login.includes('grid grid-cols-2 gap-3'), 'secondary actions share equal columns');
});

test('layout-only change preserves existing auth and support callbacks', () => {
  for (const callback of [
    'onClick={submitLogin}',
    'onClick={handleGoogleLogin}',
    'onClick={() => setIsCreatingProfile(true)}',
    'onClick={() => setIsRecoveringPassword(true)}',
    'onClick={handleDemoMode}',
    'onClick={() => setShowHelpModal(true)}',
    "onKeyDown={(e) => e.key === 'Enter' && submitLogin()}",
  ]) assert(auth.includes(callback), callback);
  assert(auth.includes('supabase.auth.signInWithOAuth'), 'OAuth login unchanged');
  assert(auth.includes('supabase.auth.signInWithPassword'), 'password auth unchanged');
});

test('the same login accommodates compact phones, landscape, tablets and text zoom', () => {
  const css = readFileSync('index.css', 'utf8');
  const html = readFileSync('index.html', 'utf8');
  assert(css.includes('@media (max-width: 359px)'), 'compact phone breakpoint');
  assert(css.includes('@media (max-height: 650px) and (orientation: landscape)'), 'landscape height breakpoint');
  assert(css.includes('clamp(12px, 4vw, 24px)'), 'fluid horizontal gutters');
  assert(css.includes('cf-auth-form { gap: 0.75rem; }'), 'landscape form density');
  assert(auth.includes('min-w-0 max-w-sm'), 'tablet/foldable card never stretches too wide');
  assert(html.includes('viewport-fit=cover'), 'safe-area support');
  assert(!html.includes('user-scalable=no') && !html.includes('maximum-scale=1'), 'pinch-zoom accessibility');
  assert(auth.includes('cf-auth-logo') && auth.includes('cf-auth-help'), 'compact header selectors');
});
