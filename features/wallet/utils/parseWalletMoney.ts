/** Parse pt-BR monetary input without accidental integer coercion or rounding. */
export function parseWalletMoney(raw: string, field = 'valor'): number {
  const value = String(raw ?? '').trim().replace(/\s/g, '');
  const brGrouped = /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/;
  const brSimple = /^\d+(?:,\d{1,2})?$/;
  const dotDecimal = /^\d+(?:\.\d{1,2})?$/;
  if (!brGrouped.test(value) && !brSimple.test(value) && !dotDecimal.test(value)) {
    throw new Error(`Informe ${field} válido, com até duas casas decimais.`);
  }
  const normalized = brGrouped.test(value) || value.includes(',')
    ? value.replace(/\./g, '').replace(',', '.')
    : value;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 9999999999.99) {
    throw new Error(`Informe ${field} dentro do limite permitido.`);
  }
  return Math.round(parsed * 100) / 100;
}
