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

const dismissedInMemory = new Map<ReleaseNoticeKind, string>();
const dismissalKey = (kind: ReleaseNoticeKind) =>
  `capitalflow:release-notice:v1:dismissed:${kind}`;

const isValidReleaseId = (value: string) => /^[a-zA-Z0-9._-]{1,128}$/.test(value);

/** Dismissing a notice does not affect a later release of the same platform. */
export function isReleaseNoticeDismissed(
  kind: ReleaseNoticeKind,
  version: string,
  storage: NoticeStorage | null = getStorage(),
): boolean {
  if (!isValidReleaseId(version)) return false;
  if (dismissedInMemory.get(kind) === version) return true;
  try { return storage?.getItem(dismissalKey(kind)) === version; }
  catch { return false; }
}

/** User-chosen dismissal, unlike mere discovery of an update. */
export function dismissReleaseNotice(
  kind: ReleaseNoticeKind,
  version: string,
  storage: NoticeStorage | null = getStorage(),
): void {
  if (!isValidReleaseId(version)) return;
  dismissedInMemory.set(kind, version);
  try { storage?.setItem(dismissalKey(kind), version); }
  catch { /* Remain dismissed in the current app session. */ }
}
