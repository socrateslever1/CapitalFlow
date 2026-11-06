import assert from 'node:assert/strict';
import test from 'node:test';
import {
 DEFAULT_MOBILE_NAV, moveMobileTab, normalizeMobileNavOrder,
 normalizeMenuOrder, readStoredNavigation, writeStoredNavigation,
 resolveNavigationPreferences,
} from '../../layout/navigationPreferences';

test('a barra exibe todas as opções e aplica ordem válida sem repetições', () => {
 const order = normalizeMobileNavOrder(['MY_WALLET','DASHBOARD','MY_WALLET','DELETE','CLIENTS']);
 assert.equal(order.length, DEFAULT_MOBILE_NAV.length);
 assert.equal(order[0], 'MY_WALLET');
 assert.equal(order[1], 'DASHBOARD');
 assert.equal(order[2], 'CLIENTS');
 assert.equal(new Set(order).size, order.length);
 assert(order.includes('SUPPORT'));
});
test('arrastar altera apenas a posição, nunca remove um botão', () => {
 const initial = normalizeMobileNavOrder(null);
 const changed = moveMobileTab(initial, 'MY_WALLET', 'DASHBOARD');
 assert.deepEqual(changed.slice(0, 2), ['MY_WALLET','DASHBOARD']);
 assert.equal(changed.length, initial.length);
 assert.deepEqual(moveMobileTab(changed, 'MY_WALLET', 'MY_WALLET'), changed);
 assert.deepEqual(moveMobileTab(initial, 'SETTINGS', 'CLIENTS'), initial);
});
test('preferências ficam isoladas por perfil e podem ser recuperadas após reabrir', () => {
 const records = new Map<string,string>();
 const original = (globalThis as any).localStorage;
 (globalThis as any).localStorage = {
   getItem: (key: string) => records.get(key) ?? null,
   setItem: (key: string, value: string) => {records.set(key,value);},
 };
 try {
   const mobile = moveMobileTab([...DEFAULT_MOBILE_NAV], 'SUPPORT', 'DASHBOARD');
   writeStoredNavigation('profile-A',{mobile,pendingMobile:true,nav:['CLIENTS','DASHBOARD'],hub:['LEGAL'],pendingDesktop:true});
   assert.equal(readStoredNavigation('profile-B'),null);
   assert.deepEqual(readStoredNavigation('profile-A')?.mobile,mobile);
   const restored = resolveNavigationPreferences('profile-A',{
     ui_nav_order:['DASHBOARD','CLIENTS'],ui_hub_order:['SOURCES'],
     ui_mobile_nav_order:[...DEFAULT_MOBILE_NAV],
   },['DASHBOARD'],['DOSSIER']);
   assert.deepEqual(restored.mobile,mobile);
   assert.deepEqual(restored.nav,['CLIENTS','DASHBOARD']);
   assert.deepEqual(restored.hub,['LEGAL']);
   writeStoredNavigation('profile-A',{...readStoredNavigation('profile-A'),pendingMobile:false,pendingDesktop:false});
   const fromRemote=resolveNavigationPreferences('profile-A',{
     ui_nav_order:['DASHBOARD','CLIENTS'],ui_hub_order:['SOURCES'],
     ui_mobile_nav_order:[...DEFAULT_MOBILE_NAV],
   },['DASHBOARD'],['DOSSIER']);
   assert.deepEqual(fromRemote.mobile,[...DEFAULT_MOBILE_NAV]);
   assert.deepEqual(fromRemote.nav,['DASHBOARD','CLIENTS']);
 } finally {
   (globalThis as any).localStorage = original;
 }
});
test('armazenamento indisponível ou malformado não derruba o sistema', () => {
 const original=(globalThis as any).localStorage;
 (globalThis as any).localStorage = {
   getItem: () => '{bad-json',
   setItem: () => {throw new Error('quota exceeded');},
 };
 try {
   assert.equal(readStoredNavigation('a'),null);
   assert.doesNotThrow(()=>writeStoredNavigation('a',{pendingMobile:true}));
   assert.deepEqual(normalizeMobileNavOrder(undefined),[...DEFAULT_MOBILE_NAV]);
   assert.deepEqual(normalizeMenuOrder(['UNKNOWN'],['DASHBOARD']),['DASHBOARD']);
 } finally {(globalThis as any).localStorage = original;}
});
