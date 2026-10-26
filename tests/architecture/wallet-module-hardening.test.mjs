import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
const root='.';
const sql=fs.readFileSync(root+'/supabase/migrations/20261025201500_wallet_module_entitlements_hardening.sql','utf8');
const mod=fs.readFileSync(root+'/features/wallet/WalletModule.tsx','utf8');
const page=fs.readFileSync(root+'/pages/PersonalWalletPage.tsx','utf8');
const realtime=fs.readFileSync(root+'/features/wallet/hooks/useWalletRealtime.ts','utf8');
test('feature entitlement cannot be self-updated',()=>{
 assert.match(sql,/REVOKE INSERT,UPDATE,DELETE ON public.user_modulos FROM authenticated/i);
 assert.match(sql,/FOR SELECT TO authenticated USING/i);
 assert.doesNotMatch(sql,/CREATE POLICY.*FOR UPDATE/is);
});
test('realtime refresh does not unmount open forms',()=>{
 assert.doesNotMatch(mod,/key=\{\x60\$\{route\}:\$\{revision\}\x60\}/);
 assert.match(mod,/capitalflow:wallet-updated/);
 assert.match(page,/addEventListener\('capitalflow:wallet-updated'/);
 assert.match(page,/removeEventListener\('capitalflow:wallet-updated'/);
 assert.match(realtime,/removeChannel\(channel\)/);
 assert.match(realtime,/owner_user_id=eq/);
});
