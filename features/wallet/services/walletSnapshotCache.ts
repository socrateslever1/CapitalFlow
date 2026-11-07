/**
 * Short-lived, user-scoped snapshot cache. Read-only; no persistence.
 * Every mutation/realtime event invalidates the generation, so an older
 * request cannot overwrite a newer snapshot.
 */
export class WalletSnapshotCache<T> {
  private ownerId: string | null = null;
  private generation = 0;
  private cached: { value: T; expiresAt: number } | null = null;
  private pending: { generation: number; promise: Promise<T> } | null = null;

  constructor(private readonly ttlMs = 25_000) {}

  switchOwner(ownerId: string) {
    if (this.ownerId === ownerId) return;
    this.ownerId = ownerId;
    this.invalidate();
  }

  invalidate() {
    this.generation += 1;
    this.cached = null;
    this.pending = null;
  }

  load(ownerId: string, loader: () => Promise<T>, force = false): Promise<T> {
    this.switchOwner(ownerId);
    if (!force && this.cached && Date.now() < this.cached.expiresAt) {
      return Promise.resolve(this.cached.value);
    }
    if (this.pending?.generation === this.generation) return this.pending.promise;

    const generation = this.generation;
    const promise = Promise.resolve().then(loader).then(value => {
      if (this.ownerId === ownerId && this.generation === generation) {
        this.cached = { value, expiresAt: Date.now() + this.ttlMs };
      }
      return value;
    }).finally(() => {
      if (this.pending?.promise === promise) this.pending = null;
    });
    this.pending = { generation, promise };
    return promise;
  }
}
