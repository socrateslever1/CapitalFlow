export const isDev: boolean = (() => {
  try {
    const anyMeta: any = (import.meta as any);
    const env = anyMeta?.env;
    if (env && typeof env.DEV !== 'undefined') return !!env.DEV;
  } catch {}

  try {
    const g: any = globalThis as any;
    if (typeof g.__DEV__ !== 'undefined') return !!g.__DEV__;
    if (typeof location !== 'undefined') {
      const h = location.hostname;
      return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local') || h.includes('.run.app');
    }
  } catch {}

  return false;
})();