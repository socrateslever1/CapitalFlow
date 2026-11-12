/**
 * Shared, deterministic primitives for the local/remote data bridge.
 * The local database remains user-scoped; this module never stores auth data.
 */
export const SYNC_PAGE_SIZE = 500;

export type SyncPage<T> = {
  data: T[] | null;
  error: Error | null;
};

export type PagedSyncResult<T> = {
  data: T[];
  error: Error | null;
};

export function idsMissingFromRemote<T extends { id?: string | null; owner_id?: unknown }>(
  localRows: T[],
  remoteRows: Array<{ id?: string | null }>,
  ownerId?: string,
): string[] {
  const remoteIds = new Set(remoteRows.map(row => row.id).filter(Boolean));
  return localRows
    .filter(row => !ownerId || row.owner_id === ownerId)
    .map(row => row.id)
    .filter((id): id is string => Boolean(id) && !remoteIds.has(id));
}

/**
 * Supabase REST responses are bounded by the server's max-rows setting.
 * Always page explicitly so a large account is not silently truncated.
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<SyncPage<T>>,
  pageSize = SYNC_PAGE_SIZE,
): Promise<PagedSyncResult<T>> {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error('Tamanho de página de sincronização inválido.');
  }

  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    if (page.error) return { data: rows, error: page.error };

    const data = Array.isArray(page.data) ? page.data : [];
    rows.push(...data);
    if (data.length < pageSize) return { data: rows, error: null };
  }
}
