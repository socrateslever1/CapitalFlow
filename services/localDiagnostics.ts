export type DiagnosticSource = 'runtime' | 'promise' | 'console' | 'react' | 'interface';
export type DiagnosticErrorType =
  | 'TypeError'
  | 'ReferenceError'
  | 'RangeError'
  | 'SyntaxError'
  | 'URIError'
  | 'DOMException'
  | 'AbortError'
  | 'Error'
  | 'Unknown';

export type DiagnosticEntry = {
  source: DiagnosticSource;
  category: string;
  errorType: DiagnosticErrorType;
  frame: string;
  build: string;
  screen: string;
  first: number;
  last: number;
  count: number;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const categories = [
  'Conexão',
  'Sessão ou permissão',
  'Carregamento',
  'Renderização',
  'Servidor de dados',
  'Falha inesperada',
] as const;

const allowedErrorTypes: readonly DiagnosticErrorType[] = [
  'TypeError',
  'ReferenceError',
  'RangeError',
  'SyntaxError',
  'URIError',
  'DOMException',
  'AbortError',
  'Error',
  'Unknown',
];

declare const __CAPITALFLOW_BUILD_ID__: string;
const build = typeof __CAPITALFLOW_BUILD_ID__ === 'string' ? __CAPITALFLOW_BUILD_ID__ : 'local';
const screens = [
  'DASHBOARD',
  'CLIENTS',
  'CONTRACTS',
  'SOURCES',
  'STATEMENT',
  'PROFILE',
  'MY_WALLET',
  'PLATFORM_ADMIN',
  'OTHER',
];

const SAFE_INTERNAL_FRAME_RE =
  /^(?:(?:assets|src|components|features|pages|hooks|services|utils|domain|layout)\/[A-Za-z0-9_./-]+\.(?:js|ts|tsx|mjs)|(?:App|main)\.(?:js|ts|tsx)):\d+:\d+$/;

function extractSafeFrame(stack: string): string {
  if (!stack) return '';
  const lines = stack.split('\n').slice(1);
  for (const rawLine of lines) {
    // Rejeita explicitamente URLs externas e evita qualquer vazamento de query/hash.
    if (/https?:\/\/(?!(?:localhost|127\.0\.0\.1|app\.capitalflow|capitalflow)\b)/i.test(rawLine)) {
      continue;
    }
    const sanitized = rawLine.replace(/\?[^:\s)]+/g, '');
    const match = sanitized.match(
      /\/((?:assets|src|components|features|pages|hooks|services|utils|domain|layout)\/[A-Za-z0-9_./-]+\.(?:js|ts|tsx|mjs)|(?:App|main)\.(?:js|ts|tsx)):(\d+):(\d+)(?:\)|\s|$)/
    );
    if (!match) continue;
    const candidate = `${match[1]}:${match[2]}:${match[3]}`;
    if (candidate.includes('localDiagnostics.')) continue;
    if (SAFE_INTERNAL_FRAME_RE.test(candidate)) return candidate;
  }
  return '';
}

function classifyErrorType(reason: unknown): DiagnosticErrorType {
  try {
    if (reason instanceof Error && typeof reason.name === 'string') {
      const exact = allowedErrorTypes.find((item) => item === reason.name);
      return exact || 'Error';
    }
  } catch {
    /* Ignore hostile getters. */
  }
  return 'Unknown';
}

function classifyCategory(message: string, errorType: DiagnosticErrorType, source: DiagnosticSource): string {
  if (/fetch|network|offline|connection|timeout|econn|failed to load/i.test(message) || errorType === 'AbortError') {
    return categories[0]; // Conexão
  }
  if (/unauthorized|forbidden|jwt|session|permission|rls|401|403|acesso n[aã]o autorizado/i.test(message)) {
    return categories[1]; // Sessão ou permissão
  }
  if (/chunk|dynamically imported|loading.*module|hmr|failed to resolve/i.test(message)) {
    return categories[2]; // Carregamento
  }
  if (
    source === 'react' ||
    errorType === 'TypeError' ||
    errorType === 'ReferenceError' ||
    /minified react error|hydrat|cannot read properties|is not a function|is not defined|maximum update depth|rendered more hooks/i.test(message)
  ) {
    return categories[3]; // Renderização
  }
  if (/pgrst|postgres|supabase|rpc|violates|constraint|duplicate key|23505|42501/i.test(message)) {
    return categories[4]; // Banco ou RPC
  }
  return categories[5]; // Falha inesperada
}

export function createDiagnostics(storage?: StorageLike, clock = Date.now) {
  let profile: string | null = null;
  let entries: DiagnosticEntry[] = [];
  let screen = 'OTHER';
  const listeners = new Set<() => void>();
  const key = () => `capitalflow:diagnostics:v1:${profile}`;
  const prune = () => {
    entries = entries.filter((e) => e.last >= clock() - 7 * 86400000).slice(-100);
  };
  const changed = () => {
    prune();
    if (profile) {
      try {
        storage?.setItem(key(), JSON.stringify(entries));
      } catch {
        /* Keep memory usable. */
      }
    }
    listeners.forEach((listener) => listener());
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setScreen(value: string) {
      screen = screens.includes(value) ? value : 'OTHER';
    },
    setSession(id: string | null) {
      if (id === profile) return;
      profile = id;
      entries = [];
      if (profile) {
        try {
          const saved: unknown = JSON.parse(storage?.getItem(key()) || '[]');
          if (Array.isArray(saved)) {
            entries = saved
              .filter(
                (e) =>
                  e &&
                  ['runtime', 'promise', 'console', 'react', 'interface'].includes(e.source) &&
                  (categories as readonly string[]).includes(e.category) &&
                  typeof e.frame === 'string' &&
                  (e.frame === '' || SAFE_INTERNAL_FRAME_RE.test(e.frame)) &&
                  typeof e.build === 'string' &&
                  /^[A-Za-z0-9-]{1,100}$/.test(e.build) &&
                  screens.includes(e.screen) &&
                  Number.isFinite(e.first) &&
                  Number.isFinite(e.last) &&
                  Number.isSafeInteger(e.count) &&
                  e.count > 0
              )
              .map(({ source, category, errorType, frame, build, screen, first, last, count }) => ({
                source,
                category,
                errorType: allowedErrorTypes.includes(errorType) ? errorType : 'Unknown',
                frame,
                build,
                screen,
                first,
                last,
                count,
              }));
          }
        } catch {
          /* Invalid storage must not break startup. */
        }
      }
      changed();
    },
    record(source: DiagnosticSource, reason: unknown, fallbackStack?: string) {
      if (!profile) return;
      let message = '';
      let stack = '';
      try {
        if (reason instanceof Error) {
          message = reason.message;
          stack = reason.stack || '';
        } else if (typeof reason === 'string') {
          message = reason;
        }
      } catch {
        /* Ignore hostile getters. */
      }
      // Messages may contain client/card data: classify but NEVER store them.
      const errorType = classifyErrorType(reason);
      const category = classifyCategory(message, errorType, source);
      const frame = extractSafeFrame(stack) || extractSafeFrame(fallbackStack || '');
      prune();
      const previous = entries.find(
        (e) =>
          e.source === source &&
          e.category === category &&
          e.errorType === errorType &&
          e.frame === frame &&
          e.build === build &&
          e.screen === screen
      );
      if (previous) {
        previous.count++;
        previous.last = clock();
      } else {
        entries.push({
          source,
          category,
          errorType,
          frame,
          build,
          screen,
          first: clock(),
          last: clock(),
          count: 1,
        });
      }
      changed();
    },
    list() {
      prune();
      return profile ? entries.map((e) => ({ ...e })).reverse() : [];
    },
    clear() {
      entries = [];
      changed();
    },
    exportReport() {
      prune();
      return JSON.stringify(
        {
          application: 'CapitalFlow',
          build: typeof __CAPITALFLOW_BUILD_ID__ === 'string' ? __CAPITALFLOW_BUILD_ID__ : 'local',
          environment:
            typeof document !== 'undefined' && document.body?.dataset.capacitorAndroid === 'true'
              ? 'Android APK'
              : 'Web',
          scope: 'Diagnóstico local sem mensagens livres; classificação indicativa',
          generatedAt: new Date(clock()).toISOString(),
          entries: profile ? entries : [],
        },
        null,
        2
      );
    },
  };
}

let storage: Storage | undefined;
try {
  if (typeof window !== 'undefined') storage = window.localStorage;
} catch {
  /* Private mode. */
}

export const localDiagnostics = createDiagnostics(storage);

export function installDiagnosticCapture() {
  const error = (event: ErrorEvent) => localDiagnostics.record('runtime', event.error || event.message);
  const rejection = (event: PromiseRejectionEvent) => localDiagnostics.record('promise', event.reason);
  const original = console.error;
  const wrapped: typeof console.error = (...args) => {
    const errArg = args.find((arg) => arg instanceof Error);
    const strArg = args.find((arg) => typeof arg === 'string');
    const isDevOnlyWarning =
      !errArg &&
      typeof strArg === 'string' &&
      /^(?:Warning:|%s|\[vite\]|React Router Future Flag)/i.test(strArg.trim());
    if (!isDevOnlyWarning) {
      const callerStack = errArg ? undefined : new Error().stack;
      localDiagnostics.record('console', errArg || strArg, callerStack);
    }
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
