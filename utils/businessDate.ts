/**
 * O vencimento financeiro é regido pelo dia civil de Manaus, não pela
 * data UTC do dispositivo. Impede vencimento antecipado entre 20h e 24h.
 * A mesma referência de fuso é usada nas validações SQL do backend.
 */
const civilDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Manaus',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function businessDateInManaus(at: Date = new Date()): string {
  if (!Number.isFinite(at.getTime())) {
    throw new Error('Data de referência inválida.');
  }
  const parts = civilDate.formatToParts(at);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) throw new Error('Não foi possível identificar a data civil.');
  return `${year}-${month}-${day}`;
}
