// utils/dateHelpers.ts
const MS_PER_DAY = 86400000;
export type DateInput = string | Date | null | undefined;

/**
 * Retorna a data de HOJE no fuso do navegador, com hora zerada (00:00:00).
 */
export const todayDateOnlyUTC = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Converte qualquer entrada para um objeto Date local (00:00:00).
 * Resolve strings ISO (UTC) para o dia correspondente no fuso do usuário de forma literal.
 */
export const parseDateOnlyUTC = (input: DateInput): Date => {
  if (!input) return todayDateOnlyUTC();

  let d: Date;
  if (input instanceof Date) {
    d = new Date(input.getTime());
  } else {
    const raw = String(input).trim();
    if (!raw) return todayDateOnlyUTC();

    // Extrai apenas a parte da data YYYY-MM-DD para ignorar shifts de UTC
    const dateMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateMatch) {
      const [_, y, m, dayPart] = dateMatch.map(Number);
      d = new Date(y, m - 1, dayPart, 0, 0, 0);
    } else if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) {
      const [dd, mm, yyyy] = raw.split('/').map(Number);
      d = new Date(yyyy, mm - 1, dd, 0, 0, 0);
    } else {
      d = new Date(raw);
    }
  }

  if (isNaN(d.getTime())) return todayDateOnlyUTC();
  d.setHours(0, 0, 0, 0);
  return d;
};

export const isWeekendUTC = (date: Date): boolean => {
  const day = date.getDay(); // Fuso Local
  return day === 0 || day === 6;
};

export const addDaysUTC = (date: DateInput, days: number, skipWeekends: boolean = false): Date => {
  let d = parseDateOnlyUTC(date);

  if (!skipWeekends) {
    d.setDate(d.getDate() + days);
    return d;
  }

  if (days > 0) {
    let added = 0;
    while (added < days) {
      d.setDate(d.getDate() + 1);
      if (!isWeekendUTC(d)) added++;
    }
  } else if (days < 0) {
    let subtracted = 0;
    while (subtracted < Math.abs(days)) {
      d.setDate(d.getDate() - 1);
      if (!isWeekendUTC(d)) subtracted++;
    }
  }

  while (isWeekendUTC(d)) {
    d.setDate(d.getDate() + 1);
  }

  return d;
};

/**
 * ✅ NOVO: Soma meses por calendário (mensal real).
 * Ex.: 31/01 + 1 mês => 28/02 (ou 29 em ano bissexto)
 */
export const addMonthsUTC = (date: DateInput, months: number): Date => {
  const d = parseDateOnlyUTC(date);
  const originalDay = d.getDate();

  // Vai para o dia 1 antes de mudar o mês (evita overflow)
  d.setDate(1);
  d.setMonth(d.getMonth() + months);

  // Último dia do mês alvo
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(originalDay, lastDay));

  d.setHours(0, 0, 0, 0);
  return d;
};

export const toISODateOnlyUTC = (date: DateInput): string => {
  const d = parseDateOnlyUTC(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const formatBRDate = (date: DateInput): string => {
  const d = parseDateOnlyUTC(date);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

export const getDaysDiff = (targetDate: DateInput): number => {
  const target = parseDateOnlyUTC(targetDate);
  const today = todayDateOnlyUTC();

  const diffTime = today.getTime() - target.getTime();
  return Math.round(diffTime / MS_PER_DAY);
};

export const isValidDate = (d: any): boolean => {
  if (!d) return false;
  const date = new Date(d);
  return !isNaN(date.getTime());
};

export const getDueStatus = (dueDate: DateInput) => {
  const diff = getDaysDiff(dueDate);
  return {
    daysLeft: diff < 0 ? Math.abs(diff) : 0,
    daysLate: diff > 0 ? diff : 0,
    isToday: diff === 0
  };
};