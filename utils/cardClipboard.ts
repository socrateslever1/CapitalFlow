import type { PersonalWalletCard } from '../services/personalWallet.service';

export function formatCardSummaryForClipboard(card: PersonalWalletCard): string {
  const maskedNumber = card.last_four
    ? `•••• •••• •••• ${card.last_four}`
    : '•••• •••• •••• ----';
  const expiry = card.expiry_month && card.expiry_year
    ? `${String(card.expiry_month).padStart(2, '0')}/${String(card.expiry_year).slice(-2)}`
    : null;
  const lines = [
    `Cartão: ${card.nickname}`,
    card.issuer ? `Emissor: ${card.issuer}` : null,
    card.brand ? `Bandeira: ${card.brand}` : null,
    `Número: ${maskedNumber}`,
    card.cardholder_name ? `Titular: ${card.cardholder_name}` : null,
    expiry ? `Validade: ${expiry}` : null,
  ].filter(Boolean);

  return lines.join('\n');
}

export async function copyCardDataToClipboard(
  card: PersonalWalletCard
): Promise<{ success: boolean; message: string }> {
  const text = formatCardSummaryForClipboard(card);
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return { success: true, message: 'Dados do cartão copiados.' };
    }
    return { success: false, message: 'Área de transferência não disponível neste navegador.' };
  } catch {
    return { success: false, message: 'Não foi possível copiar os dados para a área de transferência.' };
  }
}

export async function copyCardLastFourToClipboard(
  lastFour: string | null | undefined
): Promise<{ success: boolean; message: string }> {
  const digits = (lastFour || '').trim();
  if (!digits) {
    return { success: false, message: 'Final do cartão não informado.' };
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(digits);
      return { success: true, message: `Final •••• ${digits} copiado!` };
    }
    return { success: false, message: 'Área de transferência não disponível.' };
  } catch {
    return { success: false, message: 'Não foi possível copiar o final do cartão.' };
  }
}

export async function copyCardFieldToClipboard(
  label: string,
  value: string
): Promise<{ success: boolean; message: string }> {
  const normalizedLabel = label.trim() || 'Informação';
  const normalizedValue = value.trim();
  if (!normalizedValue) return { success: false, message: `${normalizedLabel} não informado.` };
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(normalizedValue);
      return { success: true, message: `${normalizedLabel} copiado.` };
    }
    return { success: false, message: 'Área de transferência não disponível.' };
  } catch {
    return { success: false, message: `Não foi possível copiar ${normalizedLabel.toLowerCase()}.` };
  }
}
