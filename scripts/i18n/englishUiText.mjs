// Detector de texto visível em inglês nas telas em português (pt-BR).
// Lê os arquivos .tsx com o compilador do TypeScript e examina somente o que o usuário vê:
// textos JSX, atributos visíveis (placeholder, title, aria-label, alt, label...) e
// mensagens passadas a toasts, alertas e estados de erro/aviso.
import ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const SCAN_ROOTS = ['App.tsx', 'components', 'containers', 'contexts', 'features', 'layout', 'pages', 'hooks', 'utils', 'i18n'];
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'android', 'supabase', 'tests', '__tests__']);
// Dicionários de outros idiomas podem (e devem) conter inglês.
const IGNORED_FILES = [/\.test\.tsx?$/, /\.stories\.tsx$/, /\.d\.ts$/, /[\\/]i18n[\\/]locales[\\/]/];

const VISIBLE_ATTRIBUTES = new Set([
  'placeholder', 'title', 'aria-label', 'aria-description', 'alt', 'label',
  'emptyText', 'emptyMessage', 'helperText', 'description', 'subtitle', 'confirmText', 'cancelText',
]);
const MESSAGE_CALLS = new Set([
  'showToast', 'toast', 'alert', 'confirm', 'prompt', 'setError', 'setNotice', 'setMessage',
  'setStatusMessage', 'setFeedback', 'notify', 'addNotification',
]);

// Palavras inequivocamente inglesas em interface. Termos já incorporados ao português do Brasil
// (Dashboard, Login, E-mail, Pix, Chat, Status, Online, Backup, Link, Download, Upload, Token)
// não entram aqui.
const ENGLISH_WORDS = new Set(`
the and you your our with without from into this that these those there here what when where which who why how
is are was were be been being has have had do does did will would should could can cannot can't don't doesn't isn't
please click tap press enter select choose loading saving saved save cancel cancelled delete deleted remove removed
edit edited add added update updated create created new open close closed back next previous continue confirm
search filter sort submit send sent retry try again error errors failed failure success successful successfully
warning invalid required optional unknown none empty yet found not nothing something anything everything
settings account accounts profile password username sign signin signup logout log in out welcome hello hi
amount balance payment payments paid unpaid pending overdue due date dates invoice invoices statement total
card cards bank transfer income expense expenses debt debts loan loans client clients customer customers
contract contracts report reports export import upload uploading downloading view details more less show hide
yes no ok all any some only also already still just now today yesterday tomorrow week month year
day days hour hours minute minutes second seconds ago left remaining of to for on at by in an a or
copy copied paste share shared help support contact message messages notification notifications
`.split(/\s+/).filter(Boolean));

// Palavras que existem em português e coincidem com inglês: não contam como evidência.
const SHARED_WORDS = new Set(['a', 'no', 'do', 'de', 'total', 'status', 'email', 'e-mail', 'chat', 'pix', 'login',
  'dashboard', 'online', 'offline', 'backup', 'link', 'download', 'upload', 'token', 'app', 'ok', 'in', 'on', 'on-line',
  'show', 'card', 'cards', 'hit', 'pin', 'cpf', 'cnpj', 'id', 'url', 'api', 'pdf', 'csv', 'excel', 'whatsapp',
  'capitalflow', 'flux', 'android', 'apk', 'google', 'supabase', 'visa', 'mastercard', 'elo', 'hipercard', 'amex',
  'more', 'contact', 'design', 'feedback', 'software', 'site', 'web', 'mobile', 'desktop', 'premium', 'sms', 'qr']);

// Nomes próprios e termos oficiais de terceiros, exibidos como o fornecedor os nomeia.
// Para incluir um novo termo, justifique no comentário (ex.: nome oficial do Mercado Pago).
export const PROPER_NAMES = [
  'Times New Roman', 'Courier New', // nomes de fontes tipográficas
  'Client ID', 'Client Secret', // nomes oficiais das credenciais do Mercado Pago
  'Select / Elite', // categoria comercial do cartão Santander
];

const PORTUGUESE_HINTS = /[áàâãéêíóôõúç]|\b(não|sim|para|com|sem|uma?|dos?|das?|que|seu|sua|valor|conta|cartão|salvar|cancelar|erro|carregando|nenhum|nenhuma|já|até|está|são|pelo|pela|como|mais|menos)\b/i;

/** Retorna as palavras inglesas de um texto, ou [] quando o texto não parece inglês. */
export function englishWordsIn(text) {
  let clean = String(text).replace(/\{[^}]*\}|\$\{[^}]*\}/g, ' ').replace(/https?:\/\/\S+/g, ' ');
  for (const name of PROPER_NAMES) clean = clean.split(name).join(' ');
  clean = clean.replace(/(\w)\((?:s|is|es|ns|ões|ães)\)/g, '$1').trim(); // contrato(s), adicional(is)
  if (!clean || !/[a-z]/i.test(clean)) return [];
  if (/^[\w.-]+@[\w.-]+$/.test(clean)) return [];
  if (/^[#./:@\w-]+$/.test(clean) && !/\s/.test(clean) && /[_:/#]|\w[.-]\w/.test(clean)) return []; // ids, rotas, classes
  if (/^[A-Z0-9_]+$/.test(clean)) return []; // siglas e códigos internos
  const words = (clean.toLowerCase().match(/[a-z']+/g) || []).filter(w => w.length > 1 || w === 'a');
  const hits = words.filter(w => ENGLISH_WORDS.has(w) && !SHARED_WORDS.has(w));
  if (!hits.length) return [];
  // Frase com acento ou palavras claramente portuguesas: inglês só se dominar o texto.
  if (PORTUGUESE_HINTS.test(clean)) return hits.length >= 3 && hits.length / words.length > 0.6 ? hits : [];
  // Palavra solta: precisa ser claramente inglesa (ex.: "Loading", "Save", "Cancel").
  return hits;
}

function listFiles(root, base) {
  const path = join(base, root);
  let info;
  try { info = statSync(path); } catch { return []; }
  if (info.isFile()) return /\.tsx?$/.test(path) ? [path] : [];
  const out = [];
  for (const name of readdirSync(path)) {
    if (IGNORED_DIRS.has(name)) continue;
    out.push(...listFiles(join(root, name), base));
  }
  return out;
}

// Chaves de objetos que viram texto de tela (listas de menus, opções, colunas, mensagens).
const UI_LABEL_KEYS = new Set(['label', 'title', 'placeholder', 'description', 'subtitle', 'message', 'text',
  'emptyText', 'helperText', 'tooltip', 'hint', 'caption', 'buttonText', 'confirmText', 'cancelText']);

function propertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return '';
}

function calleeName(expr) {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return '';
}

function stringsInExpression(node, out) {
  if (!node) return;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) { out.push(node); return; }
  if (ts.isTemplateExpression(node)) { out.push(node); return; }
  if (ts.isConditionalExpression(node)) { stringsInExpression(node.whenTrue, out); stringsInExpression(node.whenFalse, out); return; }
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    if (op === ts.SyntaxKind.PlusToken || op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.AmpersandAmpersandToken) {
      stringsInExpression(node.left, out); stringsInExpression(node.right, out);
    }
    return;
  }
  if (ts.isParenthesizedExpression(node)) stringsInExpression(node.expression, out);
}

function literalText(node, sf) {
  if (ts.isTemplateExpression(node)) return node.getText(sf).slice(1, -1);
  return node.text;
}

/** Varre o frontend e devolve [{file, line, text, words}]. */
// Áreas já 100% traduzidas: aqui nenhum texto visível pode ficar fixo no código (nem em português);
// tudo passa pelo dicionário i18n/locales. Ao traduzir uma nova área, acrescente o arquivo aqui.
export const TRANSLATED_FILES = [
  'features/auth/AuthScreen.tsx',
  'features/auth/useAuth.ts',
  'components/settings/LoginLanguageSwitcher.tsx',
  'components/settings/LanguageSelector.tsx',
];
const BRAND_LITERALS = new Set(['Capital', 'Flow', 'CapitalFlow']);

const anyFixedText = (text) => {
  const clean = String(text).replace(/\$\{[^}]*\}|\{[^}]*\}/g, ' ').replace(/\s+/g, ' ').trim();
  if (!/\p{L}{2}/u.test(clean) || BRAND_LITERALS.has(clean)) return [];
  return [clean];
};

/** Textos visíveis escritos direto no código das áreas já traduzidas. */
export function findHardcodedUiText(base = process.cwd(), files = TRANSLATED_FILES) {
  return findEnglishUiText(base, files, anyFixedText);
}

export function findEnglishUiText(base = process.cwd(), roots = SCAN_ROOTS, detector = englishWordsIn) {
  const findings = [];
  const files = roots.flatMap(r => listFiles(r, base)).filter(f => !IGNORED_FILES.some(rx => rx.test(f)));
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const rel = relative(base, file).split(sep).join('/');
    const report = (node, text) => {
      if (/i18n-ignore/.test(source.slice(Math.max(0, node.getFullStart() - 120), node.getStart(sf)))) return;
      const words = detector(text);
      if (!words.length) return;
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      findings.push({ file: rel, line: line + 1, text: text.replace(/\s+/g, ' ').trim().slice(0, 120), words });
    };
    const visit = (node) => {
      if (ts.isJsxElement(node) && ['style', 'script', 'code', 'pre'].includes(node.openingElement.tagName.getText(sf))) return;
      if (ts.isPropertyAssignment(node) && UI_LABEL_KEYS.has(propertyName(node.name))) {
        const s = []; stringsInExpression(node.initializer, s); s.forEach(n => report(n, literalText(n, sf)));
      }
      if (ts.isJsxText(node)) {
        const text = node.text.replace(/\s+/g, ' ').trim();
        if (text) report(node, text);
      } else if (ts.isJsxAttribute(node) && node.initializer) {
        const name = node.name.getText(sf);
        if (VISIBLE_ATTRIBUTES.has(name)) {
          const init = node.initializer;
          if (ts.isStringLiteral(init)) report(init, init.text);
          else if (ts.isJsxExpression(init)) { const s = []; stringsInExpression(init.expression, s); s.forEach(n => report(n, literalText(n, sf))); }
        }
      } else if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
        const s = []; stringsInExpression(node.expression, s); s.forEach(n => report(n, literalText(n, sf)));
      } else if (ts.isCallExpression(node) && MESSAGE_CALLS.has(calleeName(node.expression))) {
        const s = []; node.arguments.slice(0, 1).forEach(a => stringsInExpression(a, s)); s.forEach(n => report(n, literalText(n, sf)));
      } else if (ts.isNewExpression(node) && calleeName(node.expression) === 'Error' && node.arguments?.length) {
        const s = []; stringsInExpression(node.arguments[0], s); s.forEach(n => report(n, literalText(n, sf)));
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return findings;
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/i18n/englishUiText.mjs')) {
  const found = findEnglishUiText();
  for (const f of found) console.log(`${f.file}:${f.line}  "${f.text}"  [${f.words.join(', ')}]`);
  console.log(`\nTotal: ${found.length} texto(s) em inglês encontrados.`);
}
