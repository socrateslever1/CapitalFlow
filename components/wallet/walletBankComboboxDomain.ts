/** Pure viewport and search helpers for the isolated card bank combobox. */
export function normalizeBankSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}

export function bankSuggestionHeight(inputBottom: number, viewportBottom: number, scrollAreaBottom: number): number {
  if (![inputBottom, viewportBottom, scrollAreaBottom].every(Number.isFinite)) return 0;
  const available = Math.floor(Math.min(viewportBottom, scrollAreaBottom) - inputBottom - 12);
  return available >= 44 ? Math.min(224, available) : 0;
}
