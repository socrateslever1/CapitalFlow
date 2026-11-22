import { Capacitor, registerPlugin } from '@capacitor/core';
export type QuickAccessStatus = {
  active: boolean;
  enabled: boolean;
  permissionGranted: boolean;
  prominent: boolean;
  priorityAvailable: boolean;
};
type QuickAccessPlugin = {
  setSession(args: { profileId: string | null }): Promise<void>;
  getStatus(): Promise<QuickAccessStatus>;
  setEnabled(args: { enabled: boolean }): Promise<QuickAccessStatus>;
  setProminent(args: { prominent: boolean }): Promise<QuickAccessStatus>;
  consumeAction(): Promise<{ action: string }>;
};
export const quickAccessSupported = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
export const walletQuickAccess = registerPlugin<QuickAccessPlugin>('WalletQuickAccess');
// Serialize session changes against cold launch / logout / rapid profile switching.
let tail: Promise<void> = Promise.resolve();
export function bindQuickAccess(profileId: string | null) {
  const result = tail.catch(() => {}).then(() => walletQuickAccess.setSession({profileId}));
  tail = result;
  return result;
}
