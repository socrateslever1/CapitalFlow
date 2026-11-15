export type DiagnosticSource = 'runtime' | 'promise' | 'console' | 'react' | 'interface';
export type DiagnosticEntry = { source: DiagnosticSource; category: string; frame: string; build: string; screen: string; first: number; last: number; count: number };
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const categories = ['Conexão', 'Sessão ou permissão', 'Carregamento', 'Falha inesperada'];
declare const __CAPITALFLOW_BUILD_ID__: string;
const build = typeof __CAPITALFLOW_BUILD_ID__ === 'string' ? __CAPITALFLOW_BUILD_ID__ : 'local';
const screens = ['DASHBOARD','CLIENTS','CONTRACTS','SOURCES','STATEMENT','PROFILE','MY_WALLET','PLATFORM_ADMIN','OTHER'];
export function createDiagnostics(storage?: StorageLike, clock = Date.now) {
  let profile: string | null = null;
  let entries: DiagnosticEntry[] = [];
  let screen = 'OTHER';
  const listeners = new Set<() => void>();
  const key = () => `capitalflow:diagnostics:v1:${profile}`;
  const prune = () => { entries = entries.filter(e => e.last >= clock() - 7 * 86400000).slice(-100); };
  const changed = () => {
    prune();
    if (profile) try { storage?.setItem(key(), JSON.stringify(entries)); } catch { /* Keep memory usable. */ }
    listeners.forEach(listener => listener());
  };
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setScreen(value: string) { screen = screens.includes(value) ? value : 'OTHER'; },
    setSession(id: string | null) {
      if (id === profile) return;
      profile = id;
      entries = [];
      if (profile) try {
        const saved: unknown = JSON.parse(storage?.getItem(key()) || '[]');
        if (Array.isArray(saved)) entries = saved.filter(e => e &&
          ['runtime','promise','console','react','interface'].includes(e.source) && categories.includes(e.category) &&
          typeof e.frame === 'string' && /^(?:assets\/[A-Za-z0-9_-]+\.js:\d+:\d+)?$/.test(e.frame) &&
          typeof e.build === 'string' && /^[A-Za-z0-9-]{1,100}$/.test(e.build) && screens.includes(e.screen) &&
          Number.isFinite(e.first) && Number.isFinite(e.last) && Number.isSafeInteger(e.count) && e.count > 0
        ).map(({source, category, frame, build, screen, first, last, count}) => ({source, category, frame, build, screen, first, last, count}));
      } catch { /* Invalid storage must not break startup. */ }
      changed();
    },
    record(source: DiagnosticSource, reason: unknown) {
      if (!profile) return;
      let message = '', stack = '';
      try {
        if (reason instanceof Error) { message = reason.message; stack = reason.stack || ''; }
        else if (typeof reason === 'string') message = reason;
      } catch { /* Ignore hostile getters. */ }
      // Messages may contain client/card data: classify but NEVER store them.
      const category = /fetch|network|offline|connection/i.test(message) ? categories[0]
        : /unauthorized|forbidden|jwt|session|permission/i.test(message) ? categories[1]
        : /chunk|dynamically imported|loading.*module/i.test(message) ? categories[2] : categories[3];
      const frame = stack.split('\n').slice(1).map(line => line.match(/\/(assets\/[A-Za-z0-9_-]+\.js):(\d+):(\d+)(?:\)|\s|$)/))
        .find(Boolean)?.slice(1).join(':') || '';
      prune();
      const previous = entries.find(e => e.source === source && e.category === category && e.frame === frame && e.build === build && e.screen === screen);
      if (previous) { previous.count++; previous.last = clock(); }
      else entries.push({ source, category, frame, build, screen, first: clock(), last: clock(), count: 1 });
      changed();
    },
    list() { prune(); return profile ? entries.map(e => ({...e})).reverse() : []; },
    clear() { entries = []; changed(); },
    exportReport() {
      prune();
      return JSON.stringify({ application: 'CapitalFlow', build: typeof __CAPITALFLOW_BUILD_ID__ === 'string' ? __CAPITALFLOW_BUILD_ID__ : 'local',
        environment: typeof document !== 'undefined' && document.body?.dataset.capacitorAndroid === 'true' ? 'Android APK' : 'Web',
        scope: 'Diagnóstico local sem mensagens livres; classificação indicativa',
        generatedAt: new Date(clock()).toISOString(), entries: profile ? entries : [] }, null, 2);
    },
  };
}
let storage: Storage | undefined;
try { if (typeof window !== 'undefined') storage = window.localStorage; } catch { /* Private mode. */ }
export const localDiagnostics = createDiagnostics(storage);
export function installDiagnosticCapture() {
  const error = (event: ErrorEvent) => localDiagnostics.record('runtime', event.error || event.message);
  const rejection = (event: PromiseRejectionEvent) => localDiagnostics.record('promise', event.reason);
  const original = console.error;
  const wrapped: typeof console.error = (...args) => {
    localDiagnostics.record('console', args.find(arg => arg instanceof Error) || args.find(arg => typeof arg === 'string'));
    original.apply(console, args);
  };
  console.error = wrapped;
  window.addEventListener('error', error);
  window.addEventListener('unhandledrejection', rejection);
  return () => {
    if (console.error === wrapped) console.error = original;
    window.removeEventListener('error', error);
    window.removeEventListener('unhandledrejection', rejection);
  };
}
