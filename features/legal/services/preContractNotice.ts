const normalizeInlineText = (value: unknown): string =>
  String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

const normalizeHttpUrl = (value: unknown): string => {
  const candidate = normalizeInlineText(value);
  if (!candidate) return '';

  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
};

export interface PreContractNoticeInput {
  clientName: string;
  signUrl?: string | null;
  portalUrl?: string | null;
}

export const buildPreContractNotice = ({ clientName, signUrl, portalUrl }: PreContractNoticeInput) => {
  const name = normalizeInlineText(clientName);
  const signatureUrl = normalizeHttpUrl(signUrl) || normalizeHttpUrl(portalUrl);

  if (!name) throw new Error('Nome do cliente nao cadastrado.');
  if (!signatureUrl) throw new Error('Link de assinatura nao disponivel.');

  return {
    signatureUrl,
    message: `Olá, ${name}, seu pré-contrato digital está disponível para leitura e assinatura antes da liberação do valor. Acesse pelo link: ${signatureUrl}. Leia com atenção e assine digitalmente para que possamos continuar a análise e liberação. Em caso de dúvidas, responda esta mensagem.`,
  };
};
