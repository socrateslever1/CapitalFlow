/**
 * Gerador de QR Code e Código Pix Copia e Cola padrão Banco Central do Brasil (EMV BRCode).
 * Gera códigos Pix válidos para qualquer aplicativo bancário brasileiro (Nubank, Itaú, Bradesco, etc.)
 */

export interface PixPayloadParams {
  pixKey: string;
  merchantName?: string;
  merchantCity?: string;
  amount?: number;
  txid?: string;
  description?: string;
}

/**
 * Remove acentuação e caracteres especiais para conformidade com a especificação EMV
 */
export function sanitizeEMVText(text: string, maxLength: number): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-zA-Z0-9 ]/g, '') // apenas alfanuméricos e espaço
    .trim()
    .toUpperCase()
    .slice(0, maxLength);
}

/**
 * Normaliza a chave Pix (remove formatação de CPF/CNPJ/Telefone se aplicável)
 */
export function normalizePixKey(rawKey: string): string {
  if (!rawKey) return '';
  const trimmed = rawKey.trim();

  // Email
  if (trimmed.includes('@')) {
    return trimmed.toLowerCase();
  }

  // Chave aleatória EVP (formato UUID com hífens)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  // Números (CPF, CNPJ ou Telefone)
  const numbersOnly = trimmed.replace(/\D/g, '');

  // CPF (11 dígitos)
  if (numbersOnly.length === 11) {
    return numbersOnly;
  }

  // CNPJ (14 dígitos)
  if (numbersOnly.length === 14) {
    return numbersOnly;
  }

  // Telefone nacional (com ou sem 55)
  if (numbersOnly.length === 10 || numbersOnly.length === 11) {
    return `+55${numbersOnly}`;
  }
  if (numbersOnly.length === 12 || numbersOnly.length === 13) {
    return `+${numbersOnly}`;
  }

  return trimmed;
}

/**
 * Formata um campo no padrão EMV: ID (2 dígitos) + Tamanho (2 dígitos) + Valor
 */
function formatEMV(id: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}

/**
 * Cálculo do Checksum CRC16-CCITT (Polinômio 0x1021, Inicial 0xFFFF)
 */
export function calculateCRC16(payload: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Gera a string do Pix Copia e Cola (BRCode estático com valor)
 */
export function generatePixCopiaECola(params: PixPayloadParams): string {
  const cleanKey = normalizePixKey(params.pixKey);
  if (!cleanKey) {
    throw new Error('Chave Pix não fornecida ou inválida.');
  }

  const name = sanitizeEMVText(params.merchantName || 'CAPITALFLOW', 25) || 'CAPITALFLOW';
  const city = sanitizeEMVText(params.merchantCity || 'BRASIL', 15) || 'BRASIL';

  // Subcampos da conta do comerciante (ID 26)
  // 00 = GUI (br.gov.bcb.pix)
  // 01 = Chave Pix
  // 02 = Descrição opcional
  let merchantAccountInfo = formatEMV('00', 'br.gov.bcb.pix') + formatEMV('01', cleanKey);
  if (params.description) {
    const cleanDesc = sanitizeEMVText(params.description, 20);
    if (cleanDesc) {
      merchantAccountInfo += formatEMV('02', cleanDesc);
    }
  }

  // Montagem do payload EMV
  let payload = '';
  payload += formatEMV('00', '01'); // Payload Format Indicator
  payload += formatEMV('26', merchantAccountInfo); // Merchant Account Information
  payload += formatEMV('52', '0000'); // Merchant Category Code (padrão 0000)
  payload += formatEMV('53', '986'); // Moeda BRL (986)

  // Valor (se fornecido)
  if (params.amount !== undefined && params.amount > 0) {
    const formattedAmount = params.amount.toFixed(2);
    payload += formatEMV('54', formattedAmount);
  }

  payload += formatEMV('58', 'BR'); // Código do País
  payload += formatEMV('59', name); // Nome do Beneficiário
  payload += formatEMV('60', city); // Cidade do Beneficiário

  // Campo adicional (ID 62): txid / Identificador da transação
  const rawTxid = (params.txid || '***').replace(/[^a-zA-Z0-9]/g, '').slice(0, 25);
  const txid = rawTxid.length > 0 ? rawTxid : '***';
  const additionalData = formatEMV('05', txid);
  payload += formatEMV('62', additionalData);

  // CRC16 inicializador (ID 63, tamanho 04)
  payload += '6304';

  // Calcula e anexa o CRC16 final
  const crc = calculateCRC16(payload);
  return `${payload}${crc}`;
}

export interface PixShareMessageParams {
  debtorName: string;
  amount: number;
  dueDateStr: string;
  installmentNumber?: number;
  totalInstallments?: number;
  contractId?: string;
  pixCopiaECola: string;
  pixKey: string;
  beneficiaryName?: string;
}

/**
 * Cria mensagem amigável e profissional para envio via WhatsApp
 */
export function buildPixWhatsAppMessage(params: PixShareMessageParams): string {
  const formattedAmount = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(params.amount);

  const installmentInfo = params.installmentNumber
    ? `Parcela: *${params.installmentNumber}${params.totalInstallments ? ` de ${params.totalInstallments}` : ''}*\n`
    : '';

  return `Olá, *${params.debtorName}*! 👋

Segue o código Pix para pagamento do seu contrato no CapitalFlow:

${installmentInfo}💰 *Valor:* ${formattedAmount}
📅 *Vencimento:* ${params.dueDateStr}${params.beneficiaryName ? `\n👤 *Beneficiário:* ${params.beneficiaryName}` : ''}

🔑 *Chave Pix:* \`${params.pixKey}\`

📲 *Código Pix Copia e Cola:*
\`\`\`${params.pixCopiaECola}\`\`\`

*Como pagar:*
1. Copie o código Pix acima
2. Abra o app do seu banco
3. Escolha *Pix* > *Pix Copia e Cola*
4. Cole o código e confirme o pagamento.

Obrigado!`;
}
