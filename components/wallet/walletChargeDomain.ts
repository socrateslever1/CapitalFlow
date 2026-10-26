import { buildStaticPix } from './pixPayload';

type WalletChargePreviewInput = {
  chargeId: string;
  account: { id: string; pix_key?: string | null; nickname: string };
  recipient: string;
  city?: string | null;
  amount: number;
  description: string;
  origin: string;
};

export type PersistedWalletChargePreview = {
  chargeId: string;
  accountId: string;
  payload: string;
  url: string;
  amount: number;
  description: string;
};

export function buildPersistedPixCharge(input: WalletChargePreviewInput): PersistedWalletChargePreview {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.chargeId)) {
    throw new Error('A cobrança precisa estar persistida antes de gerar o PIX.');
  }
  if (!input.account.pix_key?.trim()) throw new Error('A conta selecionada não possui chave PIX.');
  const description = input.description.trim();
  const payload = buildStaticPix({
    key: input.account.pix_key,
    recipient: input.recipient,
    city: input.city,
    amount: input.amount,
    description,
  });
  const url = new URL('/pix/cobrar', input.origin);
  url.searchParams.set('brcode', payload);
  url.searchParams.set('descricao', description);
  url.searchParams.set('charge', input.chargeId);
  return {
    chargeId: input.chargeId,
    accountId: input.account.id,
    payload,
    url: url.toString(),
    amount: input.amount,
    description,
  };
}
