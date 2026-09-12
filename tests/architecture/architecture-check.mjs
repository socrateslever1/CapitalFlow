import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

const walk = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name) ? [full] : [];
  });
};

const relative = (file) => path.relative(root, file).replaceAll('\\', '/');

for (const file of walk(path.join(root, 'domain'))) {
  const text = fs.readFileSync(file, 'utf8');
  const imports = [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
  for (const specifier of imports) {
    if (/lib\/supabase|(^|\/)services(\/|$)|(^|\/)components(\/|$)|(^|\/)pages(\/|$)/.test(specifier)) {
      failures.push(`${relative(file)} -> import proibido no domínio: ${specifier}`);
    }
  }
}

const clientRoots = ['lib', 'components', 'pages', 'features', 'hooks', 'services', 'domain', 'utils'];
for (const rootName of clientRoots) {
  for (const file of walk(path.join(root, rootName))) {
    const text = fs.readFileSync(file, 'utf8');
    if (/VITE_SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE_KEY/.test(text)) {
      failures.push(`${relative(file)} -> referência a service role em código de runtime`);
    }
  }
}

if (failures.length > 0) {
  console.error('Falhas arquiteturais encontradas:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('✓ domínio isolado de Supabase/UI/services');
console.log('✓ nenhuma service role detectada no código de runtime');
