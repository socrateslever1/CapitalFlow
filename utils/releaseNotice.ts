/**
 * Remember which release has already been presented automatically on this device.
 * The bell remains available independently of this marker.
 */
export type ReleaseNoticeKind = 'android-install' | 'android-update' | 'web-update';
export interface NoticeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
const shownInMemory = new Map<ReleaseNoticeKind, string>();

const getStorage = (): NoticeStorage | null => {
  try { return typeof localStorage === 'undefined' ? null : localStorage; }
  catch { return null; }
};

export const releaseNoticeKey = (kind: ReleaseNoticeKind): string =>
  `capitalflow:release-notice:v1:${kind}`;

/**
 * Claim once at the moment of showing the popup, not only after dismissing it.
 * localStorage survives remounts and app/browser restarts. When unavailable,
 * an in-memory fallback prevents a new popup on every component remount.
 */
export function claimReleaseNotice(
  kind: ReleaseNoticeKind,
  version: string,
  storage: NoticeStorage | null = getStorage(),
): boolean {
  if (!/^[a-zA-Z0-9._-]{1,128}$/.test(version)) return false;
  const key = releaseNoticeKey(kind);
  try {
    if (storage?.getItem(key) === version) return false;
  } catch { /* Storage can be disabled on private browsers. */ }
  if (shownInMemory.get(kind) === version) return false;
  shownInMemory.set(kind, version);
  try { storage?.setItem(key, version); }
  catch { /* In-memory protection remains for this running session. */ }
  return true;
}
