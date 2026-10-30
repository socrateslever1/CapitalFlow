/**
 * Short-lived device-session handle. Never persists the PIN, master key or
 * decrypted card information in localStorage, sessionStorage or IndexedDB.
 * A CryptoKey is non-extractable. Backgrounding immediately locks the vault.
 */
const MAX_IDLE_MS = 120_000;
let cached: {owner:string;key:CryptoKey;validUntil:number}|null=null;
let guardAttached=false;

function attachBackgroundLock():void {
  if(guardAttached || typeof document==='undefined') return;
  guardAttached=true;
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden) clearWalletVaultSession();
  });
  if(typeof window!=='undefined') {
    window.addEventListener('pagehide',clearWalletVaultSession);
  }
}
export function clearWalletVaultSession():void {cached=null;}
export function getWalletVaultKey(owner:string):CryptoKey|null {
  attachBackgroundLock();
  if(!owner || !cached || cached.owner!==owner || cached.validUntil<Date.now()) {
    clearWalletVaultSession();
    return null;
  }
  cached.validUntil=Date.now()+MAX_IDLE_MS;
  return cached.key;
}
export function cacheWalletVaultKey(owner:string,key:CryptoKey):void {
  if(!owner || key.extractable) throw new Error('Chave do cofre inválida.');
  attachBackgroundLock();
  cached={owner,key,validUntil:Date.now()+MAX_IDLE_MS};
}
