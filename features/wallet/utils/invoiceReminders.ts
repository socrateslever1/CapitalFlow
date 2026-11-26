import { getInvoiceCycleDates, getPurchaseInvoiceMonth, type CardCycleSource } from '../../../components/wallet/invoiceStatementDomain';

export type InvoiceReminderCard = CardCycleSource & {
  id: string;
  nickname: string;
  closing_day: number | null;
  due_day: number | null;
  status?: string | null;
};

export type InvoiceReminder = {
  key: string;
  cardId: string;
  kind: 'CLOSE' | 'DUE';
  date: string;
  days: number;
  text: string;
};

const when = (days: number) => days === 0 ? 'hoje' : days === 1 ? 'amanhã' : `em ${days} dias`;

/**
 * Faturas que fecham ou vencem em até `windowDays` dias, pela regra de ciclo de cada cartão
 * (fechamento dinâmico, dia útil e fechamento informado do mês). Sem valores no texto.
 */
export function buildInvoiceReminders(cards: InvoiceReminderCard[], today: string, windowDays = 3): InvoiceReminder[] {
  const daysUntil = (day: string) => Math.round((Date.parse(day + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86400000);
  return cards.flatMap(card => {
    if (!card.due_day || card.status === 'CANCELED') return [];
    try {
      const open = getPurchaseInvoiceMonth(today, card.closing_day, card.due_day, card);
      const dates = getInvoiceCycleDates(open, card.closing_day, card.due_day, null, card);
      const previousMonth = new Date(Date.UTC(Number(open.slice(0, 4)), Number(open.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10);
      const previous = getInvoiceCycleDates(previousMonth, card.closing_day, card.due_day, null, card);
      const items: InvoiceReminder[] = [];
      const toClose = daysUntil(dates.closingDate);
      if (toClose >= 0 && toClose <= windowDays) items.push({
        key: `${card.id}:close:${dates.closingDate}`, cardId: card.id, kind: 'CLOSE', date: dates.closingDate, days: toClose,
        text: `${card.nickname}: fatura fecha ${when(toClose)} (${dates.closingDate.slice(8, 10)}/${dates.closingDate.slice(5, 7)}).`,
      });
      const toDue = daysUntil(previous.dueDate);
      if (toDue >= 0 && toDue <= windowDays) items.push({
        key: `${card.id}:due:${previous.dueDate}`, cardId: card.id, kind: 'DUE', date: previous.dueDate, days: toDue,
        text: `${card.nickname}: fatura vence ${when(toDue)} (${previous.dueDate.slice(8, 10)}/${previous.dueDate.slice(5, 7)}).`,
      });
      return items;
    } catch {
      return [];
    }
  });
}
