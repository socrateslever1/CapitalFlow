import type { AppTab } from '../types';

/** Every mobile destination remains available; preferences change ORDER only. */
export const DEFAULT_MOBILE_NAV: readonly AppTab[] = Object.freeze([
  'DASHBOARD', 'DOSSIER', 'SIMULATOR', 'CLIENTS',
  'SOURCES', 'MY_WALLET', 'LEGAL', 'SUPPORT',
]);

const VALID_TABS = new Set<AppTab>([
  'DASHBOARD', 'DOSSIER', 'CLIENTS', 'LEGAL', 'SOURCES', 'PROFILE',
  'SETTINGS', 'CONTRACT_DETAILS', 'SIMULATOR', 'FLOW',
  'LEGAL_DOCUMENT_EDITOR', 'EXTRATO', 'SUPPORT', 'REPORTS',
  'MY_WALLET', 'PLATFORM_ADMIN',
]);

export function normalizeMenuOrder(value: unknown, fallback: readonly AppTab[]): AppTab[] {
  const items = Array.isArray(value) && value.length ? value : fallback;
  const seen = new Set<AppTab>();
  const out: AppTab[] = [];
  for (const item of items) {
    if (typeof item !== 'string' || !VALID_TABS.has(item as AppTab)) continue;
    const tab = item as AppTab;
    if (seen.has(tab)) continue;
    seen.add(tab);
    out.push(tab);
  }
  return out.length ? out : [...fallback];
}

export function normalizeMobileNavOrder(value: unknown): AppTab[] {
  const allowed = new Set(DEFAULT_MOBILE_NAV);
  const seen = new Set<AppTab>();
  const items: AppTab[] = [];
  if (Array.isArray(value)) for (const candidate of value) {
    if (!allowed.has(candidate as AppTab) || seen.has(candidate as AppTab)) continue;
    seen.add(candidate as AppTab);
    items.push(candidate as AppTab);
  }
  for (const tab of DEFAULT_MOBILE_NAV) if (!seen.has(tab)) items.push(tab);
  return items;
}

export function moveMobileTab(order: readonly AppTab[], selected: AppTab, target: AppTab): AppTab[] {
  const current = normalizeMobileNavOrder(order);
  if (selected === target || !current.includes(selected) || !current.includes(target)) return current;
  const next = current.filter(tab => tab !== selected);
  const targetIndex = next.indexOf(target);
  next.splice(targetIndex, 0, selected);
  return next;
}

export type StoredNavigation = {
  nav?: AppTab[];
  hub?: AppTab[];
  mobile?: AppTab[];
  pendingDesktop?: boolean;
  pendingMobile?: boolean;
};

const key = (profileId: string) => 'capitalflow:ui-navigation:v2:' + profileId;
export function readStoredNavigation(profileId: string): StoredNavigation | null {
  if (!profileId) return null;
  try {
    const raw = localStorage.getItem(key(profileId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const value = parsed as Record<string, unknown>;
    return {
      nav: Array.isArray(value.nav) ? normalizeMenuOrder(value.nav, []) : undefined,
      hub: Array.isArray(value.hub) ? normalizeMenuOrder(value.hub, []) : undefined,
      mobile: Array.isArray(value.mobile) ? normalizeMobileNavOrder(value.mobile) : undefined,
      pendingDesktop: value.pendingDesktop === true,
      pendingMobile: value.pendingMobile === true,
    };
  } catch {
    return null; // Storage may be disabled; do not break app navigation.
  }
}
export function writeStoredNavigation(profileId: string, data: StoredNavigation): void {
  if (!profileId) return;
  try {
    localStorage.setItem(key(profileId), JSON.stringify({
      nav: data.nav, hub: data.hub, mobile: data.mobile,
      pendingDesktop: data.pendingDesktop === true,
      pendingMobile: data.pendingMobile === true,
    }));
  } catch {
    // Database remains authoritative when local storage is blocked.
  }
}

export function resolveNavigationPreferences(
  profileId: string,
  remote: { ui_nav_order?: unknown; ui_hub_order?: unknown; ui_mobile_nav_order?: unknown },
  defaultNav: readonly AppTab[],
  defaultHub: readonly AppTab[],
): { nav: AppTab[]; hub: AppTab[]; mobile: AppTab[]; pending: StoredNavigation | null } {
  const stored = readStoredNavigation(profileId);
  return {
    nav: normalizeMenuOrder(stored?.pendingDesktop ? stored.nav : remote.ui_nav_order, defaultNav),
    hub: normalizeMenuOrder(stored?.pendingDesktop ? stored.hub : remote.ui_hub_order, defaultHub),
    mobile: normalizeMobileNavOrder(stored?.pendingMobile ? stored.mobile : remote.ui_mobile_nav_order),
    pending: stored,
  };
}
