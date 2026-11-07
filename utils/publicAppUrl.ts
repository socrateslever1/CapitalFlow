/** Public links must not inherit Capacitor's private https://localhost origin. */
export const DEFAULT_PUBLIC_APP_ORIGIN = 'https://capflow.pages.dev';
export function getPublicAppOrigin(): string {
  const env = (import.meta as ImportMeta & {env?: {VITE_PUBLIC_APP_ORIGIN?: string}}).env;
  const configured = (env?.VITE_PUBLIC_APP_ORIGIN || '').trim();
  if (!configured) return DEFAULT_PUBLIC_APP_ORIGIN;
  try {
    const url = new URL(configured);
    if (url.protocol === 'https:' && !url.username && !url.password &&
        !url.search && !url.hash && url.pathname === '/' &&
        !['localhost','127.0.0.1','0.0.0.0','[::1]'].includes(url.hostname.toLowerCase())) {
      return url.origin;
    }
  } catch { /* invalid build setting */ }
  return DEFAULT_PUBLIC_APP_ORIGIN;
}
export function buildPublicAppUrl(route: string, parameters: Record<string,string|number>): string {
  if (!route.startsWith('/') || route.startsWith('//') || route.includes('\\')) {
    throw new Error('Rota pública inválida.');
  }
  const url = new URL(route, getPublicAppOrigin());
  for (const [key,value] of Object.entries(parameters)) {
    if (!key || value === '' || value == null) throw new Error('Parâmetro público inválido.');
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}
/** Keep signed third-party HTTPS storage links intact, never rewrite them to our domain. */
export function normalizeShareableAppUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const canonical = new URL(getPublicAppOrigin());
    const url = new URL(value, canonical);
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    const local = host === 'localhost' || host.endsWith('.localhost')
      || host === '127.0.0.1' || host === '0.0.0.0' || host === '[::1]';
    const app = host === canonical.hostname.toLowerCase() || host === 'capflow.pages.dev'
      || host.endsWith('.capflow.pages.dev');
    if (local || app) return canonical.origin + url.pathname + url.search + url.hash;
    return url.protocol === 'https:' ? url.toString() : null;
  } catch { return null; }
}
