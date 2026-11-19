export const APP_SYNC_EVENTS = {
  WALLET_UPDATED: 'capitalflow:wallet-updated',
  CAPITAL_SYNC_REQUESTED: 'capitalflow:sync-requested',
  SOURCE_ORIGINS_UPDATED: 'capitalflow:source-origins-updated',
} as const;

export function notifyWalletUpdated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(APP_SYNC_EVENTS.WALLET_UPDATED));
}

export function notifyCapitalSyncRequested(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(APP_SYNC_EVENTS.CAPITAL_SYNC_REQUESTED));
}

export function notifySourceOriginsUpdated(detail?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(APP_SYNC_EVENTS.SOURCE_ORIGINS_UPDATED, detail ? { detail } : undefined));
}

export function notifyFinancialDataChanged(options: {
  wallet?: boolean;
  capital?: boolean;
  sourceOrigins?: boolean;
  sourceOriginsDetail?: Record<string, unknown>;
}): void {
  if (options.wallet) notifyWalletUpdated();
  if (options.capital) notifyCapitalSyncRequested();
  if (options.sourceOrigins) notifySourceOriginsUpdated(options.sourceOriginsDetail);
}
