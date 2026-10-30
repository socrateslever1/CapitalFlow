import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PersonalWalletAccount, PersonalWalletCard } from '../../services/personalWallet.service';

type NativeFilePayload = { name: string; mimeType: string; base64: string };
const receiver = registerPlugin<{
  peek(): Promise<{ pending: boolean }>;
  consume(): Promise<NativeFilePayload>;
}>('WalletFileInbox');

export const isWalletNativeInboxAvailable = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export async function hasIncomingWalletFile(): Promise<boolean> {
  if (!isWalletNativeInboxAvailable()) return false;
  return (await receiver.peek()).pending;
}

/** Files never leave the device unless the user explicitly chooses a cloud reader. */
export async function consumeIncomingWalletFile(): Promise<File> {
  if (!isWalletNativeInboxAvailable()) throw new Error('Compartilhamento disponível apenas no APK Android.');
  const data = await receiver.consume();
  if (data.base64.length > 14_000_000) throw new Error('Arquivo acima do tamanho permitido.');
  const binary = atob(data.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], data.name, { type: data.mimeType });
}

export type WalletDestination = { kind: 'ACCOUNT' | 'CARD'; targetId: string; label: string; reason: string };

const clean = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases: Array<[RegExp, string]> = [
  [/nubank|nupagamentos|nuconta/i, 'nubank'],
  [/recargapay/i, 'recargapay'], [/bradesco/i,'bradesco'],
  [/banco\s*do\s*brasil|bancodobrasil/i, 'bancodobrasil'],
  [/itau/i, 'itau'], [/santander/i, 'santander'], [/picpay/i,'picpay'],
  [/inter/i,'inter'], [/caixaeconomica|caixaeconomica/i,'caixaeconomica'],
  [/mercadopago/i,'mercadopago'], [/c6bank/i,'c6bank'],
];
function institutionToken(value: string) {
  const normalized = clean(value);
  return aliases.find(([pattern]) => pattern.test(normalized))?.[1] || normalized;
}
function ofxTag(text: string, field: string): string {
  return new RegExp('<' + field + '(?:\\s[^>]*)?>\\s*([^<\\r\\n]*)','i').exec(text)?.[1]?.trim() || '';
}

/**
 * Never guess between two accounts/cards from one bank. Last-four and OFX
 * source type are only used to preselect; ledger writes still need confirmation.
 */
export function suggestWalletDestination(
  fileName: string, snippet: string,
  accounts: PersonalWalletAccount[], cards: PersonalWalletCard[],
): WalletDestination | null {
  const isCard = /<CCSTMTRS|<CCACCTFROM|<CREDITCARDMSGSRSV1/i.test(snippet) ||
    /fatura|cart[aã]o|creditcard/i.test(fileName);
  const isAccount = /<BANKACCTFROM|<STMTRS|<BANKMSGSRSV1/i.test(snippet) ||
    /extrato\s+conta|conta\s+corrente/i.test(fileName);
  if (isCard === isAccount) return null;

  const org = [ofxTag(snippet, 'ORG'), ofxTag(snippet,'BANKID'), ofxTag(snippet,'FID')].filter(Boolean);
  const source = [fileName, ...org].map(institutionToken);
  const accountId = ofxTag(snippet,'ACCTID').replace(/\D/g,'');
  const digits = accountId.length >= 4 ? accountId.slice(-4) : '';
  const matchesBank = (bank: string) => {
    const token = institutionToken(bank);
    return token.length >= 4 && source.some(candidate => candidate.includes(token) || token.includes(candidate) && candidate.length >= 4);
  };
  if (isCard) {
    const candidates = cards.filter(card => card.status !== 'CANCELED' &&
      (matchesBank(card.issuer || '') || matchesBank(card.nickname)));
    const exact = digits ? candidates.filter(card => card.last_four === digits) : [];
    const selected = exact.length === 1 ? exact[0]
      : candidates.length === 1 && (!digits || !candidates[0].last_four) ? candidates[0] : null;
    if (!selected) return null;
    return { kind:'CARD',targetId:selected.id,label:selected.nickname,reason: exact.length === 1
      ? 'Banco e final do cartão identificados no documento'
      : 'Único cartão encontrado para a instituição indicada' };
  }
  const candidates = accounts.filter(account => !account.archived_at &&
    (matchesBank(account.bank_name || '') || matchesBank(account.nickname)));
  const exact = accountId ? candidates.filter(account =>
    clean(String(account.bank_details?.account_number || '')) === accountId) : [];
  const selected = exact.length === 1 ? exact[0]
    : candidates.length === 1 && (!accountId || !candidates[0].bank_details?.account_number)
      ? candidates[0] : null;
  if (!selected) return null;
  return {kind:'ACCOUNT',targetId:selected.id,label:selected.nickname,reason:exact.length === 1
    ? 'Instituição e número da conta identificados no documento'
    : 'Única conta encontrada para a instituição indicada'};
}
