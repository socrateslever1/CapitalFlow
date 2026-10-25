type PixInput = {
  key: string;
  recipient: string;
  city?: string | null;
  amount?: number;
  description?: string;
};

const emv = (id: string, value: string) => `${id}${String(new TextEncoder().encode(value).length).padStart(2, '0')}${value}`;

function crc16(payload: string) {
  let crc = 0xffff;
  for (const char of new TextEncoder().encode(payload)) {
    crc ^= char << 8;
    for (let index = 0; index < 8; index += 1) crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    crc &= 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function ascii(value: string, limit: number) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 .-]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, limit);
}

function txid(value?: string) {
  const normalized = ascii(value || '', 25).replace(/[^A-Z0-9]/g, '');
  return normalized || '***';
}

export function buildStaticPix(input: PixInput) {
  const key = input.key.trim();
  const recipient = ascii(input.recipient, 25);
  const city = ascii(input.city || 'BRASILIA', 15) || 'BRASILIA';
  if (!key || key.length > 77) throw new Error('Chave PIX inválida.');
  if (!recipient) throw new Error('Titular da conta inválido.');
  if (input.amount !== undefined && (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 99999999.99)) throw new Error('Valor inválido.');
  const merchantAccount = emv('00', 'BR.GOV.BCB.PIX') + emv('01', key);
  const fields = emv('00', '01') + emv('26', merchantAccount) + emv('52', '0000') + emv('53', '986')
    + (input.amount !== undefined ? emv('54', input.amount.toFixed(2)) : '')
    + emv('58', 'BR') + emv('59', recipient) + emv('60', city) + emv('62', emv('05', txid(input.description)));
  const check = `${fields}6304`;
  return check + crc16(check);
}
