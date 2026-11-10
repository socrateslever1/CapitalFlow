import type { WalletOverviewSnapshot, WalletSnapshot } from './walletRepository';

const DB_NAME = 'capitalflow_wallet_offline';
const DB_VERSION = 1;
const SNAPSHOT_STORE = 'wallet_snapshots';
const ACCESS_STORE = 'wallet_access';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

type StoredWalletSnapshot = {
  userId: string;
  savedAt: number;
  fullSnapshot: WalletSnapshot | null;
  overviewSnapshot: WalletOverviewSnapshot | null;
};

type StoredWalletAccess = {
  userId: string;
  active: boolean;
  settings: Record<string, unknown>;
  savedAt: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  if (!hasIndexedDb()) return Promise.reject(new Error('IndexedDB unavailable'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'userId' });
      }
      if (!db.objectStoreNames.contains(ACCESS_STORE)) {
        db.createObjectStore(ACCESS_STORE, { keyPath: 'userId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
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

export function deriveOverviewFromSnapshot(
  full: WalletSnapshot,
  cardInvoiceDates?: WalletOverviewSnapshot['cardInvoiceDates'],
): WalletOverviewSnapshot {
  const resolvedDates = cardInvoiceDates && cardInvoiceDates.length > 0
    ? cardInvoiceDates
    : (full.cardInvoiceFacts || []).map(fact => ({
        card_id: fact.card_id,
        due_month: fact.due_month,
        due_date: fact.due_date ?? null,
      }));
  return {
    accounts: full.accounts,
    cards: full.cards,
    expenses: full.expenses,
    installments: full.installments,
    invoicePayments: full.invoicePayments,
    payables: full.payables,
    recurringIncomes: full.recurringIncomes,
    recurringReceipts: full.recurringReceipts,
    cardInvoiceDates: resolvedDates,
  };
}

export async function saveWalletOfflineFull(
  userId: string,
  fullSnapshot: WalletSnapshot,
): Promise<WalletOverviewSnapshot> {
  const existing = await readSnapshotRecord(userId);
  const overviewSnapshot = deriveOverviewFromSnapshot(
    fullSnapshot,
    fullSnapshot.cardInvoiceFacts?.length ? undefined : (existing?.overviewSnapshot?.cardInvoiceDates || []),
  );
  if (!hasIndexedDb() || !userId) return overviewSnapshot;
  try {
    const db = await openDb();
    const tx = db.transaction(SNAPSHOT_STORE, 'readwrite');
    tx.objectStore(SNAPSHOT_STORE).put({
      userId,
      savedAt: Date.now(),
      fullSnapshot,
      overviewSnapshot,
    } satisfies StoredWalletSnapshot);
    await txComplete(tx);
  } catch {
    /* Persistência offline é melhor esforço e não bloqueia a operação principal. */
  }
  return overviewSnapshot;
}

export async function saveWalletOfflineOverview(
  userId: string,
  overviewSnapshot: WalletOverviewSnapshot,
): Promise<void> {
  if (!hasIndexedDb() || !userId) return;
  try {
    const existing = await readSnapshotRecord(userId);
    const db = await openDb();
    const tx = db.transaction(SNAPSHOT_STORE, 'readwrite');
    tx.objectStore(SNAPSHOT_STORE).put({
      userId,
      savedAt: Date.now(),
      fullSnapshot: existing?.fullSnapshot || null,
      overviewSnapshot,
    } satisfies StoredWalletSnapshot);
    await txComplete(tx);
  } catch {
    /* Persistência offline opcional */
  }
}

async function readSnapshotRecord(userId: string): Promise<StoredWalletSnapshot | null> {
  if (!hasIndexedDb() || !userId) return null;
  try {
    const db = await openDb();
    const tx = db.transaction(SNAPSHOT_STORE, 'readonly');
    const record = await requestToPromise<StoredWalletSnapshot | undefined>(
      tx.objectStore(SNAPSHOT_STORE).get(userId),
    );
    if (!record) return null;
    if (Date.now() - Number(record.savedAt || 0) > MAX_AGE_MS) return null;
    return record;
  } catch {
    return null;
  }
}

export async function loadWalletOfflineFull(userId: string): Promise<WalletSnapshot | null> {
  const record = await readSnapshotRecord(userId);
  return record?.fullSnapshot || null;
}

export async function loadWalletOfflineOverview(userId: string): Promise<WalletOverviewSnapshot | null> {
  const record = await readSnapshotRecord(userId);
  if (record?.overviewSnapshot) return record.overviewSnapshot;
  if (record?.fullSnapshot) return deriveOverviewFromSnapshot(record.fullSnapshot);
  return null;
}

export async function saveWalletOfflineAccess(
  userId: string,
  access: { active: boolean; settings: Record<string, unknown> },
): Promise<void> {
  if (!hasIndexedDb() || !userId) return;
  try {
    const db = await openDb();
    const tx = db.transaction(ACCESS_STORE, 'readwrite');
    tx.objectStore(ACCESS_STORE).put({
      userId,
      active: access.active,
      settings: access.settings || {},
      savedAt: Date.now(),
    } satisfies StoredWalletAccess);
    await txComplete(tx);
  } catch {
    /* Persistência offline opcional */
  }
}

export async function loadWalletOfflineAccess(
  userId: string,
): Promise<{ active: boolean; settings: Record<string, unknown> } | null> {
  if (!hasIndexedDb() || !userId) return null;
  try {
    const db = await openDb();
    const tx = db.transaction(ACCESS_STORE, 'readonly');
    const record = await requestToPromise<StoredWalletAccess | undefined>(
      tx.objectStore(ACCESS_STORE).get(userId),
    );
    if (!record) return null;
    if (Date.now() - Number(record.savedAt || 0) > MAX_AGE_MS) return null;
    return { active: Boolean(record.active), settings: record.settings || {} };
  } catch {
    return null;
  }
}

