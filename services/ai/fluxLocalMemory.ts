/**
 * Device-only encrypted continuity. No messages or keys are stored in localStorage,
 * and ordinary chat never requires a Supabase history read/write.
 * Non-extractable AES-GCM keys and ciphertext are kept in IndexedDB per account.
 * This does not protect against a compromised origin; logout/account isolation
 * and session authorization remain mandatory.
 */
export type FluxMemoryMessage = { id: string; role: 'user' | 'assistant'; text: string };
const DB_NAME = 'capitalflow-flux-memory-v1';
const STORE = 'conversations';
const KEYS = 'keys';
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_MESSAGES = 32;
const MAX_CHARS = 1500;

type EncryptedRecord = {
  id: string; savedAt: number; iv: Uint8Array; ciphertext: ArrayBuffer;
};
const identifier = (profileId: string, conversationId: string): string =>
  JSON.stringify([profileId, conversationId]);

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Falha de memória local.'));
  });

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined' || !globalThis.crypto?.subtle) {
    return Promise.reject(new Error('Memória criptografada não suportada neste dispositivo.'));
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(KEYS)) db.createObjectStore(KEYS);
    };
    req.onerror = () => reject(req.error || new Error('Banco local indisponível.'));
    req.onsuccess = () => resolve(req.result);
    req.onblocked = () => reject(new Error('Memória local bloqueada por outra aba.'));
  });
}

async function getKey(db: IDBDatabase, id: string, create: boolean): Promise<CryptoKey | null> {
  const saved = await requestResult(db.transaction(KEYS, 'readonly').objectStore(KEYS).get(id)) as CryptoKey | undefined;
  if (saved) return saved;
  if (!create) return null;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await requestResult(db.transaction(KEYS, 'readwrite').objectStore(KEYS).put(key, id));
  return key;
}

const safeMessages = (raw: unknown): FluxMemoryMessage[] => {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-MAX_MESSAGES).flatMap((candidate): FluxMemoryMessage[] => {
    if (!candidate || typeof candidate !== 'object') return [];
    const value = candidate as Record<string, unknown>;
    if (typeof value.id !== 'string' || value.id.length > 120 ||
      (value.role !== 'user' && value.role !== 'assistant') || typeof value.text !== 'string') return [];
    const text = value.text.slice(0, MAX_CHARS).trim();
    return text ? [{ id: value.id, role: value.role, text }] : [];
  });
};

export const limitFluxMemory = safeMessages;

export async function loadFluxMemory(profileId: string, conversationId: string): Promise<FluxMemoryMessage[]> {
  const id = identifier(profileId, conversationId);
  const db = await openDb();
  try {
    const record = await requestResult(db.transaction(STORE, 'readonly').objectStore(STORE).get(id)) as EncryptedRecord | undefined;
    if (!record) return [];
    if (!Number.isFinite(record.savedAt) || Date.now() - record.savedAt > RETENTION_MS) {
      await requestResult(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id));
      return [];
    }
    const key = await getKey(db, id, false);
    if (!key) return [];
    const plaintext = await crypto.subtle.decrypt({
      name: 'AES-GCM', iv: record.iv,
      additionalData: new TextEncoder().encode(id),
    }, key, record.ciphertext);
    return safeMessages(JSON.parse(new TextDecoder().decode(plaintext)));
  } finally { db.close(); }
}

const writes = new Map<string, Promise<void>>();
export function saveFluxMemory(profileId: string, conversationId: string, messages: FluxMemoryMessage[]): Promise<void> {
  const id = identifier(profileId, conversationId);
  const copy = safeMessages(messages);
  const previous = writes.get(id) || Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const db = await openDb();
    try {
      const key = await getKey(db, id, true);
      if (!key) throw new Error('Chave local indisponível.');
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt({
        name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(id),
      }, key, new TextEncoder().encode(JSON.stringify(copy)));
      await requestResult(db.transaction(STORE, 'readwrite').objectStore(STORE).put({
        id, savedAt: Date.now(), iv, ciphertext: encrypted,
      } satisfies EncryptedRecord));
    } finally { db.close(); }
  });
  writes.set(id, next);
  void next.finally(() => { if (writes.get(id) === next) writes.delete(id); }).catch(() => {});
  return next;
}

export async function clearFluxMemory(profileId: string, conversationId: string): Promise<void> {
  const id = identifier(profileId, conversationId);
  await (writes.get(id) || Promise.resolve()).catch(() => {});
  const db = await openDb();
  try {
    await Promise.all([
      requestResult(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id)),
      requestResult(db.transaction(KEYS, 'readwrite').objectStore(KEYS).delete(id)),
    ]);
  } finally { db.close(); }
}
