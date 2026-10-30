export function calculateCardOpening(
  limit: number,
  used: number,
  invoice: number,
  nativeFuture = 0,
) {
  const values = [limit, used, invoice, nativeFuture];
  if (
    values.some(
      (value) =>
        !Number.isFinite(value) ||
        value < 0 ||
        Math.abs(value * 100 - Math.round(value * 100)) > 0.00001,
    )
  ) {
    throw new Error(
      'Informe valores positivos ou zero, com até duas casas decimais.',
    );
  }
  const [total, committed, bill, future] = values.map((value) =>
    Math.round(value * 100),
  );
  if (bill + future > committed)
    throw new Error(
      'O limite usado precisa incluir a fatura e os gastos futuros já cadastrados.',
    );
  return {
    available: Math.max(0, total - committed) / 100,
    overLimit: Math.max(0, committed - total) / 100,
    other: (committed - bill) / 100,
    unallocated: (committed - bill - future) / 100,
  };
}
