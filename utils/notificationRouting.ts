import { InAppNotification } from '../hooks/useAppNotifications';

export function resolveNotificationTarget(notification: InAppNotification): string {
  if (notification.action_url) {
    return notification.action_url;
  }

  if (notification.item_type && notification.item_id) {
    const { item_type, item_id, metadata } = notification;

    switch (item_type) {
      case 'contrato':
        return `/contratos/${item_id}?highlight=${item_id}`;
      case 'parcela':
        return `/contratos/${metadata?.loan_id}?tab=parcelas&highlight=${item_id}`;
      case 'acordo':
        return `/contratos/${metadata?.loan_id}?tab=acordos&highlight=${item_id}`;
      case 'pagamento':
        return `/contratos/${metadata?.loan_id}?tab=extrato&highlight=${item_id}`;
      case 'cliente':
        return `/clientes?highlight=${item_id}`;
      case 'carteira':
        return `/fontes?highlight=${item_id}`;
      case 'suporte':
        return `/suporte?highlight=${item_id}`;
      case 'documento':
        return `/contratos/${metadata?.loan_id}?tab=juridico&highlight=${item_id}`;
      case 'lead':
        return `/leads?highlight=${item_id}`;
      default:
        return '/notificacoes';
    }
  }

  return '/notificacoes';
}
