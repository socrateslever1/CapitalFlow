type WalletPage<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

/** A short page may be a server limit, so only an empty page proves completion. */
export async function loadAllWalletRows<T>(
  readPage: (from: number, to: number) => PromiseLike<WalletPage<T>>,
  pageSize = 500,
): Promise<{ data: T[]; error: null }> {
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0) throw new Error('Tamanho de página inválido.');
  const data: T[] = [];
  while (true) {
    const page = await readPage(data.length, data.length + pageSize - 1);
    if (page.error) throw new Error(page.error.message);
    if (!page.data?.length) return { data, error: null };
    data.push(...page.data);
  }
}
