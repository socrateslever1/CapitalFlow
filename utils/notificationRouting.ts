import { InAppNotification } from '../hooks/useAppNotifications';

const buildContractPath = (
  loanId?: string | null,
  query?: Record<string, string | null | undefined>
): string => {
  if (!loanId) return '/';

  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });

  const suffix = params.toString() ? `?${params.toString()}` : '';
  return `/contrato/${loanId}${suffix}`;
};

const normalizeActionUrl = (actionUrl?: string): string | null => {
  if (!actionUrl) return null;

  // Compatibilidade com notificacoes antigas que apontavam para /contratos/:id.
  const legacyContractMatch = actionUrl.match(/^\/contratos\/([a-f0-9-]+)(.*)$/i);
  if (legacyContractMatch) {
    return `/contrato/${legacyContractMatch[1]}${legacyContractMatch[2] || ''}`;
  }

  return actionUrl;
};

export function resolveNotificationTarget(notification: InAppNotification): string {
  const normalizedActionUrl = normalizeActionUrl(notification.action_url);
  if (normalizedActionUrl) return normalizedActionUrl;

  const metadata = notification.metadata || {};
  const loanId = metadata.loan_id || metadata.loanId;

  if (notification.item_type && notification.item_id) {
    const { item_type, item_id } = notification;

    switch (item_type) {
      case 'contrato':
        return buildContractPath(item_id, { highlight: item_id });
      case 'parcela':
        return buildContractPath(loanId, { tab: 'parcelas', highlight: item_id });
      case 'acordo':
        return buildContractPath(loanId, { tab: 'acordos', highlight: item_id });
      case 'pagamento':
        return buildContractPath(loanId, { tab: 'extrato', highlight: item_id });
      case 'portal_file':
        return buildContractPath(loanId, { tab: 'arquivos', highlight: item_id });
      case 'documento':
        return buildContractPath(loanId || item_id, { tab: 'juridico', highlight: item_id });
      case 'suporte':
        return buildContractPath(loanId, { tab: 'atendimento', highlight: item_id });
      case 'cliente':
        return `/clientes?highlight=${item_id}`;
      case 'carteira':
        return `/fontes?highlight=${item_id}`;
      case 'lead':
        return `/leads?highlight=${item_id}`;
      default:
        break;
    }
  }

  // Notificacoes de pagamento podem chegar sem item_type, mas com loan_id no metadata.
  if (loanId) return buildContractPath(loanId);

  return '/';
}
