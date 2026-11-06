import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type CapturedBankNotice = {
  id: string;
  packageName: string;
  institution: string;
  cents: number;
  mode: 'CARD' | 'ACCOUNT';
  at: number;
};
export type BankNoticeBank = { id: string; label: string };
export type BankNoticeStatus = {
  permissionGranted: boolean;
  enabled: boolean;
  packages: string[];
  availableBanks: BankNoticeBank[];
};
type NativeBankPlugin = {
  setSession(args: { profileId: string | null }): Promise<{ active: boolean }>;
  getStatus(): Promise<BankNoticeStatus>;
  openAccessSettings(): Promise<void>;
  setEnabled(args: { enabled: boolean }): Promise<{ enabled: boolean }>;
  setAllowedBanks(args: { packages: string[] }): Promise<void>;
  listPending(): Promise<{ items: CapturedBankNotice[] }>;
  dismiss(args: { id: string }): Promise<void>;
  clearPending(): Promise<void>;
  addListener(name: 'pendingChanged', cb: () => void): Promise<PluginListenerHandle>;
};
const native = registerPlugin<NativeBankPlugin>('WalletBankNotifications');

export const bankNotificationsSupported = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

let sessionTail: Promise<void> = Promise.resolve();
export function bindBankNotificationsProfile(profileId: string | null): Promise<void> {
  if (!bankNotificationsSupported()) return Promise.resolve();
  const next = sessionTail.catch(() => {}).then(async () => {
    await native.setSession({ profileId });
  });
  sessionTail = next;
  return next;
}
export async function getBankNoticeStatus(): Promise<BankNoticeStatus> {
  if (!bankNotificationsSupported()) throw new Error('Disponível somente no aplicativo Android.');
  return native.getStatus();
}
export async function openBankNoticeSettings(): Promise<void> {
  if (!bankNotificationsSupported()) return;
  return native.openAccessSettings();
}
export async function setBankNoticeEnabled(enabled: boolean): Promise<void> {
  if (!bankNotificationsSupported()) return;
  await native.setEnabled({ enabled });
}
export async function setBankNoticePackages(packages: string[]): Promise<void> {
  if (!bankNotificationsSupported()) return;
  await native.setAllowedBanks({ packages });
}
export async function listBankNotices(): Promise<CapturedBankNotice[]> {
  if (!bankNotificationsSupported()) return [];
  const result = await native.listPending();
  return Array.isArray(result.items) ? result.items.filter(item =>
    /^[a-f0-9]{64}$/.test(item.id) &&
    Number.isSafeInteger(item.cents) && item.cents > 0 && item.cents <= 100_000_000_000 &&
    Number.isFinite(item.at) && (item.mode === 'CARD' || item.mode === 'ACCOUNT') &&
    typeof item.institution === 'string') : [];
}
export async function dismissBankNotice(id: string): Promise<void> {
  if (!bankNotificationsSupported()) return;
  await native.dismiss({ id });
}
export async function clearBankNotices(): Promise<void> {
  if (!bankNotificationsSupported()) return;
  await native.clearPending();
}
export async function listenBankNotices(callback: () => void): Promise<() => Promise<void>> {
  if (!bankNotificationsSupported()) return async () => {};
  const handler = await native.addListener('pendingChanged', callback);
  return () => handler.remove();
}
