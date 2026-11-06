/** A bubble is an event cue, never an LLM-generated claim or a bank read. */
export type FinancialNotificationCue = {
  id: string; title: string; type: 'info' | 'warning' | 'error' | 'success';
  createdAt: number; item_type?: string;
};
export type FluxCue = { sourceId: string; text: string; kind: 'due' | 'overdue' | 'attention' };

const normalize = (value: string): string => value.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase();
const FINANCIAL_TITLE = /(parcela|fatura|venciment|vencid|atraso|inadimpl|saldo|limite|compromiss|carteira)/;
const NON_FINANCIAL = /(mensagem|suporte|documento|atendimento|cadastro|contrato assinado)/;

export function cueForNotification(notification: FinancialNotificationCue): FluxCue | null {
  const title = normalize(notification.title);
  if (!Number.isFinite(notification.createdAt) || notification.createdAt <= 0) return null;
  if (notification.type === 'success' || NON_FINANCIAL.test(title)) return null;
  if (!FINANCIAL_TITLE.test(title)) return null;
  if (notification.type === 'info' && !/(vence hoje|vence em|vencimento hoje)/.test(title)) return null;
  if (/(vencid|atrasad|inadimpl)/.test(title)) {
    return { sourceId: notification.id, kind: 'overdue', text: 'Há um vencimento em atraso para conferir.' };
  }
  if (/(vence|venciment)/.test(title)) {
    return { sourceId: notification.id, kind: 'due', text: 'Há um vencimento próximo para conferir.' };
  }
  if (notification.type !== 'warning' && notification.type !== 'error') return null;
  return { sourceId: notification.id, kind: 'attention', text: 'Há um alerta financeiro para conferir.' };
}

export function mayShowFluxCue(input: {
  now: number; lastShownAt: number; shownToday: number;
  enabled: boolean; panelOpen: boolean; privacyHidden: boolean;
  pageVisible: boolean; editorOpen: boolean;
}): boolean {
  return input.enabled && !input.panelOpen && !input.privacyHidden &&
    input.pageVisible && !input.editorOpen &&
    input.shownToday < 2 &&
    input.now - input.lastShownAt >= 2 * 60 * 60 * 1000;
}
