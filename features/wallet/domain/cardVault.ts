export type ProtectedCardData = { number: string; securityCode: string };
export type CardVaultEnvelope = {
  version: 1; algorithm: 'AES-GCM'; iterations: number;
  salt: string; iv: string; ciphertext: string; context_id: string;
};
export type CardVaultV2Envelope = {
  version: 2; algorithm: 'AES-GCM'; iv: string; ciphertext: string; context_id: string;
};
export type AnyCardVaultEnvelope = CardVaultEnvelope | CardVaultV2Envelope;
export type WrappedWalletMasterKey = {
  version: 1; iterations: 600000; salt: string; iv: string; ciphertext: string;
};
const ITERATIONS = 600_000;
const encode = (value: Uint8Array) => btoa(Array.from(value, byte => String.fromCharCode(byte)).join(''));
const decode = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));
const bytes = (value: Uint8Array) => new Uint8Array(value).buffer as ArrayBuffer;
const contextBytes = (owner: string, context: string) => new TextEncoder().encode(`CapitalFlow/Card/v1/${owner}/${context}`);

export function validateCardNumber(raw: string): string {
  const number = raw.replace(/[ -]/g, '');
  if (!/^\d{12,19}$/.test(number)) throw new Error('Informe o número completo do cartão, com 12 a 19 dígitos.');
  let total=0; let double=false;
  for(let index=number.length-1;index>=0;index--){
    let digit=Number(number[index]); if(double){digit*=2;if(digit>9)digit-=9;} total+=digit; double=!double;
  }
  if(total%10!==0 || /^0+$/.test(number)) throw new Error('Número do cartão inválido. Confira os dígitos.');
  return number;
}

function normalized(data: ProtectedCardData): ProtectedCardData {
  const number=validateCardNumber(data.number);
  const securityCode=data.securityCode.trim();
  if(securityCode && !/^\d{3,4}$/.test(securityCode)) throw new Error('O CVC deve ter 3 ou 4 dígitos.');
  return {number,securityCode};
}

async function key(password: string, salt: Uint8Array) {
  if(!globalThis.crypto?.subtle) throw new Error('O cofre precisa de uma conexão HTTPS ou do aplicativo atualizado.');
  if(password.length<12 || password.length>256) throw new Error('Use uma senha do cofre com 12 caracteres ou mais, até 256.');
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:bytes(salt),iterations:ITERATIONS},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}

export async function encryptCardData(data: ProtectedCardData,password: string,owner: string,context: string): Promise<CardVaultEnvelope> {
  if(!globalThis.crypto?.subtle)throw new Error('O cofre precisa de uma conexão HTTPS ou do aplicativo atualizado.');
  const value=normalized(data);
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const derived=await key(password,salt);
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv:bytes(iv),additionalData:contextBytes(owner,context)},derived,new TextEncoder().encode(JSON.stringify(value)));
  return {version:1,algorithm:'AES-GCM',iterations:ITERATIONS,salt:encode(salt),iv:encode(iv),ciphertext:encode(new Uint8Array(ciphertext)),context_id:context};
}

export async function decryptCardData(envelope: CardVaultEnvelope,password: string,owner: string): Promise<ProtectedCardData> {
  if(envelope?.version!==1 || envelope.algorithm!=='AES-GCM' || envelope.iterations!==ITERATIONS
    || typeof envelope.context_id!=='string' || typeof envelope.ciphertext!=='string' || envelope.ciphertext.length>4096) throw new Error('Formato do cofre inválido.');
  let salt: Uint8Array; let iv: Uint8Array; let ciphertext: Uint8Array;
  try {salt=decode(envelope.salt);iv=decode(envelope.iv);ciphertext=decode(envelope.ciphertext);} catch {throw new Error('Formato do cofre inválido.');}
  if(salt.length!==16 || iv.length!==12 || ciphertext.length<17) throw new Error('Formato do cofre inválido.');
  const derived=await key(password,salt);
  try {
    const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv),additionalData:contextBytes(owner,envelope.context_id)},derived,bytes(ciphertext));
    return normalized(JSON.parse(new TextDecoder().decode(plaintext)));
  } catch {throw new Error('Senha incorreta ou dados protegidos adulterados.');}
}


const masterAdditionalData = new TextEncoder().encode('CapitalFlow/WalletMaster/v1');
const cardV2AdditionalData = (owner:string,context:string) =>
  new TextEncoder().encode('CapitalFlow/Card/v2/'+owner+'/'+context);

function requirePin(pin:string):void {
  if(!/^\d{8,12}$/.test(pin)) throw new Error('O PIN da Carteira precisa ter de 8 a 12 dígitos.');
}
async function pinKey(pin:string,salt:Uint8Array):Promise<CryptoKey> {
  requirePin(pin);
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:bytes(salt),iterations:ITERATIONS},
    material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}

export async function createWalletMasterPin(pin:string):Promise<{profile:WrappedWalletMasterKey;key:CryptoKey}> {
  if(!globalThis.crypto?.subtle) throw new Error('Criptografia indisponível. Use HTTPS ou o aplicativo atualizado.');
  requirePin(pin);
  const raw=crypto.getRandomValues(new Uint8Array(32));
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const iv=crypto.getRandomValues(new Uint8Array(12));
  try {
    const wrapping=await pinKey(pin,salt);
    const ciphertext=await crypto.subtle.encrypt(
      {name:'AES-GCM',iv:bytes(iv),additionalData:bytes(masterAdditionalData)},wrapping,bytes(raw));
    const key=await crypto.subtle.importKey('raw',bytes(raw),'AES-GCM',false,['encrypt','decrypt']);
    return {profile:{version:1,iterations:ITERATIONS,salt:encode(salt),iv:encode(iv),
      ciphertext:encode(new Uint8Array(ciphertext))},key};
  } finally {raw.fill(0);}
}

export async function unlockWalletMasterPin(profile:WrappedWalletMasterKey,pin:string):Promise<CryptoKey> {
  if(!globalThis.crypto?.subtle) throw new Error('Criptografia indisponível.');
  if(profile?.version!==1 || profile.iterations!==ITERATIONS ||
      typeof profile.salt!=='string' || typeof profile.iv!=='string' ||
      typeof profile.ciphertext!=='string') throw new Error('Formato do PIN protegido inválido.');
  let salt:Uint8Array,iv:Uint8Array,ciphertext:Uint8Array;
  try {salt=decode(profile.salt);iv=decode(profile.iv);ciphertext=decode(profile.ciphertext);}
  catch {throw new Error('Formato do PIN protegido inválido.');}
  if(salt.length!==16 || iv.length!==12 || ciphertext.length!==48)
    throw new Error('Formato do PIN protegido inválido.');
  const wrapping=await pinKey(pin,salt);
  try {
    const raw=new Uint8Array(await crypto.subtle.decrypt(
      {name:'AES-GCM',iv:bytes(iv),additionalData:bytes(masterAdditionalData)},wrapping,bytes(ciphertext)));
    try {return await crypto.subtle.importKey('raw',bytes(raw),'AES-GCM',false,['encrypt','decrypt']);}
    finally {raw.fill(0);}
  } catch {throw new Error('PIN incorreto ou cofre danificado.');}
}

export async function encryptCardWithMaster(
  data:ProtectedCardData,key:CryptoKey,owner:string,context:string
):Promise<CardVaultV2Envelope> {
  if(!globalThis.crypto?.subtle) throw new Error('Criptografia indisponível.');
  // CVC is sensitive authentication data and must never be stored, even encrypted.
  const value=normalized({...data,securityCode:''});
  if(!/^[a-f0-9-]{36}$/i.test(context)) throw new Error('Identificador do cartão inválido.');
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt(
    {name:'AES-GCM',iv:bytes(iv),additionalData:bytes(cardV2AdditionalData(owner,context))},
    key,new TextEncoder().encode(JSON.stringify(value)));
  return {version:2,algorithm:'AES-GCM',iv:encode(iv),ciphertext:encode(new Uint8Array(ciphertext)),context_id:context};
}

export async function decryptCardWithMaster(
  envelope:CardVaultV2Envelope,key:CryptoKey,owner:string
):Promise<ProtectedCardData> {
  if(envelope?.version!==2 || envelope.algorithm!=='AES-GCM' ||
     typeof envelope.context_id!=='string' ||
     !/^[a-f0-9-]{36}$/i.test(envelope.context_id) ||
     typeof envelope.ciphertext!=='string' || envelope.ciphertext.length>4096)
    throw new Error('Formato do cofre inválido.');
  let iv:Uint8Array,ciphertext:Uint8Array;
  try {iv=decode(envelope.iv);ciphertext=decode(envelope.ciphertext);}
  catch {throw new Error('Formato do cofre inválido.');}
  if(iv.length!==12 || ciphertext.length<17) throw new Error('Formato do cofre inválido.');
  try {
    const raw=await crypto.subtle.decrypt({
      name:'AES-GCM',iv:bytes(iv),
      additionalData:bytes(cardV2AdditionalData(owner,envelope.context_id)),
    },key,bytes(ciphertext));
    return normalized(JSON.parse(new TextDecoder().decode(raw)));
  } catch {throw new Error('Não foi possível abrir os dados deste cartão com o PIN da Carteira.');}
}
