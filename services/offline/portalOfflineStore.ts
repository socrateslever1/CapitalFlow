type PortalSnapshot = {
  schemaVersion?: number;
  token: string;
  code: string;
  savedAt: string;
  payload: {
    clientData: any;
    contracts: any[];
    fullLoanData: any;
    installments: any[];
    signals: any[];
    documents: any[];
  };
};

type PortalOutboxItem = {
  id?: number;
  type: 'PORTAL_PAYMENT_INTENT';
  token: string;
  code: string;
  payload: {
    tipo: string;
    comprovanteUrl: string | null;
  };
  status: 'PENDING' | 'FAILED' | 'DEAD';
  attempts: number;
  maxAttempts: number;
  nextRetryAt: string;
  createdAt: string;
  updatedAt: string;
  lastAttemptAt?: string | null;
  lastError?: string | null;
};

const DB_NAME = 'capitalflow_offline';
const DB_VERSION = 1;
const SNAPSHOT_SCHEMA_VERSION = 1;
const SNAPSHOT_STORE = 'portal_snapshots';
const OUTBOX_STORE = 'portal_outbox';
const SNAPSHOT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

let dbPromise: Promise<IDBDatabase> | null = null;

function getSnapshotKey(token: string, code: string) {
  return `${token}::${code}`;
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        const outbox = db.createObjectStore(OUTBOX_STORE, { keyPath: 'id', autoIncrement: true });
        outbox.createIndex('by_status', 'status', { unique: false });
        outbox.createIndex('by_createdAt', 'createdAt', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

function requestToPromise<T = any>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function savePortalSnapshot(snapshot: PortalSnapshot): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(SNAPSHOT_STORE, 'readwrite');
  const store = tx.objectStore(SNAPSHOT_STORE);
  const key = getSnapshotKey(snapshot.token, snapshot.code);
  store.put({ key, schemaVersion: SNAPSHOT_SCHEMA_VERSION, ...snapshot });
  await txComplete(tx);
}

export async function loadPortalSnapshot(token: string, code: string): Promise<PortalSnapshot | null> {
  const db = await openDb();
  const tx = db.transaction(SNAPSHOT_STORE, 'readonly');
  const store = tx.objectStore(SNAPSHOT_STORE);
  const key = getSnapshotKey(token, code);
  const data = await requestToPromise<any>(store.get(key));
  if (!data) return null;
  const savedAtMs = new Date(String(data.savedAt || 0)).getTime();
  if (Number.isFinite(savedAtMs) && Date.now() - savedAtMs > SNAPSHOT_MAX_AGE_MS) {
    const cleanupTx = db.transaction(SNAPSHOT_STORE, 'readwrite');
    cleanupTx.objectStore(SNAPSHOT_STORE).delete(key);
    await txComplete(cleanupTx);
    return null;
  }
  return data as PortalSnapshot;
}

export async function enqueuePortalPaymentIntent(
  token: string,
  code: string,
  tipo: string,
  comprovanteUrl?: string | null
): Promise<number> {
  const db = await openDb();
  const tx = db.transaction(OUTBOX_STORE, 'readwrite');
  const store = tx.objectStore(OUTBOX_STORE);
  const all = (await requestToPromise<any[]>(store.getAll())) || [];
  const duplicated = all.find((item) =>
    item?.type === 'PORTAL_PAYMENT_INTENT' &&
    item?.token === token &&
    item?.code === code &&
    item?.payload?.tipo === tipo &&
    (item?.payload?.comprovanteUrl ?? null) === (comprovanteUrl ?? null) &&
    (item?.status === 'PENDING' || item?.status === 'FAILED')
  );
  if (duplicated?.id) {
    return Number(duplicated.id);
  }

  const now = new Date().toISOString();
  const item: PortalOutboxItem = {
    type: 'PORTAL_PAYMENT_INTENT',
    token,
    code,
    payload: { tipo, comprovanteUrl: comprovanteUrl ?? null },
    status: 'PENDING',
    attempts: 0,
    maxAttempts: 7,
    nextRetryAt: now,
    createdAt: now,
    updatedAt: now,
    lastAttemptAt: null,
    lastError: null,
  };
  const key = await requestToPromise<IDBValidKey>(store.add(item));
  await txComplete(tx);
  return Number(key);
}

export async function listPendingOutbox(): Promise<Array<Required<PortalOutboxItem>>> {
  const db = await openDb();
  const tx = db.transaction(OUTBOX_STORE, 'readonly');
  const store = tx.objectStore(OUTBOX_STORE);
  const all = (await requestToPromise<any[]>(store.getAll())) || [];
  const now = Date.now();
  return all
    .filter((item) => item?.status === 'PENDING' || item?.status === 'FAILED')
    .filter((item) => {
      const nextRetry = new Date(String(item?.nextRetryAt || 0)).getTime();
      if (!Number.isFinite(nextRetry)) return true;
      return nextRetry <= now;
    })
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export async function markOutboxSynced(id: number): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(OUTBOX_STORE, 'readwrite');
  tx.objectStore(OUTBOX_STORE).delete(id);
  await txComplete(tx);
}

export async function markOutboxFailed(id: number, errorMessage: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(OUTBOX_STORE, 'readwrite');
  const store = tx.objectStore(OUTBOX_STORE);
  const existing = await requestToPromise<any>(store.get(id));
  if (!existing) return;
  const attempts = Number(existing.attempts || 0) + 1;
  const maxAttempts = Number(existing.maxAttempts || 7);
  const backoffMs = Math.min(5 * 60 * 1000, Math.pow(2, Math.min(attempts, 8)) * 1000);
  existing.attempts = attempts;
  existing.maxAttempts = maxAttempts;
  existing.status = attempts >= maxAttempts ? 'DEAD' : 'FAILED';
  existing.updatedAt = new Date().toISOString();
  existing.lastAttemptAt = existing.updatedAt;
  existing.nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
  existing.lastError = errorMessage;
  store.put(existing);
  await txComplete(tx);
}

export async function markOutboxAttempted(id: number): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(OUTBOX_STORE, 'readwrite');
  const store = tx.objectStore(OUTBOX_STORE);
  const existing = await requestToPromise<any>(store.get(id));
  if (!existing) return;
  existing.lastAttemptAt = new Date().toISOString();
  existing.updatedAt = existing.lastAttemptAt;
  store.put(existing);
  await txComplete(tx);
}

export async function requeueDeadOutboxItems(limit = 20): Promise<number> {
  const db = await openDb();
  const tx = db.transaction(OUTBOX_STORE, 'readwrite');
  const store = tx.objectStore(OUTBOX_STORE);
  const all = (await requestToPromise<any[]>(store.getAll())) || [];
  const dead = all
    .filter((item) => item?.status === 'DEAD')
    .sort((a, b) => String(a.updatedAt || '').localeCompare(String(b.updatedAt || '')))
    .slice(0, Math.max(0, limit));

  const now = new Date().toISOString();
  for (const item of dead) {
    item.status = 'FAILED';
    item.nextRetryAt = now;
    item.updatedAt = now;
    item.lastError = item.lastError || 'requeued_manual';
    store.put(item);
  }
  await txComplete(tx);
  return dead.length;
}

export async function getOutboxStats() {
  const db = await openDb();
  const tx = db.transaction(OUTBOX_STORE, 'readonly');
  const store = tx.objectStore(OUTBOX_STORE);
  const all = (await requestToPromise<any[]>(store.getAll())) || [];
  const summary = {
    total: all.length,
    pending: 0,
    failed: 0,
    dead: 0,
    oldestCreatedAt: null as string | null,
    newestCreatedAt: null as string | null,
  };

  for (const item of all) {
    if (item?.status === 'PENDING') summary.pending += 1;
    if (item?.status === 'FAILED') summary.failed += 1;
    if (item?.status === 'DEAD') summary.dead += 1;
  }

  const ordered = all
    .map((item) => String(item?.createdAt || ''))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  if (ordered.length > 0) {
    summary.oldestCreatedAt = ordered[0];
    summary.newestCreatedAt = ordered[ordered.length - 1];
  }

  return summary;
}
