import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(path, 'utf8');

test('barra móvel usa a ordem de cada perfil e suporta arraste por toque', () => {
 const nav=read('layout/BottomNav.tsx');
 assert.match(nav, /normalizeMobileNavOrder\(mobileNavOrder\)/);
 assert.match(nav, /moveMobileTab\(previous, dragged\.tab, target\)/);
 assert.match(nav, /setPointerCapture/);
 assert.match(nav, /touchAction: 'none'/);
 assert.match(nav, /saveMobileNavOrder\(draftOrder\)/);
 assert.doesNotMatch(nav, /const mobileTabs = \[/);
});
test('salvamento não ignora erros e mantém ordem local quando a rede falha', () => {
 const state=read('hooks/useAppState.ts');
 assert.match(state, /writeStoredNavigation\(profileId/);
 assert.match(state, /\.select\('id'\)\.maybeSingle\(\)/);
 assert.match(state, /retryPendingNavigation\(searchId\)/);
 assert.match(state, /setMobileNavOrder\(mobile\)/);
 assert.doesNotMatch(state, /if \(error\) console\.error\(error\)/);
 const profile=read('pages/ProfilePage.tsx');
 assert.match(profile,/await saveNavConfig\(newNav, newHub\)/);
 assert.match(profile,/disabled=\{menuSaving\}/);
});
test('a preferência móvel é separada da configuração desktop, com RLS existente', () => {
 const migration=read('supabase/migrations/20261106220000_profile_mobile_navigation_order.sql');
 assert.match(migration,/ADD COLUMN IF NOT EXISTS ui_mobile_nav_order/);
 assert.match(migration,/jsonb_array_length/);
 assert.doesNotMatch(migration,/DROP TABLE|DISABLE ROW LEVEL SECURITY/);
 const app=read('App.tsx'),shell=read('layout/AppShell.tsx');
 assert.match(app,/mobileNavOrder=\{mobileNavOrder\}/);
 assert.match(app,/desktopNavOrder=\{visibleHubOrder\}/);
 assert.match(app,/navOrder=\{visibleHubOrder\}/);
 assert.match(shell,/navOrder=\{desktopNavOrder\}/);
 assert.match(shell,/saveMobileNavOrder=\{saveMobileNavOrder\}/);
 const types=read('types.ts');
 assert.match(types,/ui_mobile_nav_order\?: AppTab\[\]/);
});
