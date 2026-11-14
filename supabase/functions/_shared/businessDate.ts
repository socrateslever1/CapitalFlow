const manausDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Manaus',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function businessDateInManaus(at: Date = new Date()): string {
  if (!Number.isFinite(at.getTime())) {
    throw new Error('Data de referência inválida.');
  }
  const parts = manausDateFormatter.formatToParts(at);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) throw new Error('Não foi possível identificar a data civil em Manaus.');
  return `${year}-${month}-${day}`;
}

