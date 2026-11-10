import path from 'path';
import fs from 'fs';
import { randomUUID } from 'node:crypto';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';


/**
 * Every successful build publishes a unique, cache-independent release marker.
 * Both the frontend bundle and /version.json receive the SAME build identifier.
 * No database, Cloudflare API token or separate deployment process is needed.
 */
function publishedVersionPlugin(buildId: string): Plugin {
  return {
    name: 'capitalflow-published-version',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ buildId }, null, 2) + '\n',
      });
    },
  };
}

/**
 * Assets públicos do módulo Carteira disponibilizados antecipadamente ao PWA.
 * Nunca inclui dados dos usuários: somente arquivos JS/CSS versionados por hash.
 */
function walletAssetsManifestPlugin(buildId: string): Plugin {
  return {
    name: 'capitalflow-wallet-asset-manifest',
    apply: 'build',
    generateBundle(_outputOptions, bundle) {
      const files = new Set<string>();
      const seen = new Set<string>();
      const visit = (name: string) => {
        if (seen.has(name)) return;
        seen.add(name);
        const entry = bundle[name];
        if (!entry || entry.type !== 'chunk') return;
        files.add('/' + entry.fileName);
        const css = (entry as typeof entry & {
          viteMetadata?: { importedCss?: Set<string> };
        }).viteMetadata?.importedCss;
        for (const stylesheet of css ?? []) files.add('/' + stylesheet);
        for (const dep of [...entry.imports, ...entry.dynamicImports]) visit(dep);
      };
      for (const [name, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk') continue;
        const isWalletCode = Object.keys(chunk.modules).some(modulePath =>
          /[\\/]features[\\/]wallet[\\/]/.test(modulePath) ||
          /[\\/]components[\\/]wallet[\\/]/.test(modulePath) ||
          /[\\/]services[\\/]personalWallet\\.service\\.tsx?$/.test(modulePath)
        );
        if (isWalletCode) visit(name);
      }
      this.emitFile({
        type: 'asset',
        fileName: 'wallet-precache.json',
        source: JSON.stringify({ version: buildId, assets: [...files].sort() }) + '\n',
      });
    },
  };
}

function spaFallbackPlugin() {
  return {
    name: 'spa-fallback-404',
    closeBundle() {
      const distDir = path.resolve('./dist');
      const indexFile = path.join(distDir, 'index.html');
      const notFoundFile = path.join(distDir, '404.html');
      if (fs.existsSync(indexFile)) {
        fs.copyFileSync(indexFile, notFoundFile);
        console.log('Copied dist/index.html -> dist/404.html');
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const commit = (process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || 'local')
    .replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'local';
  const buildId = `${commit}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  return {
    // Vite injects every matching env variable into the browser bundle.
    // Explicitly permit public settings only; provider secrets are never exposed.
    envPrefix: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPPORT_PHONE', 'VITE_WEB_PUSH_PUBLIC_KEY', 'VITE_PUBLIC_APP_ORIGIN'],
    server: { port: 3005, host: '0.0.0.0', allowedHosts: true },
    plugins: [react(), tailwindcss(), publishedVersionPlugin(buildId), walletAssetsManifestPlugin(buildId), spaFallbackPlugin()],
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      '__CAPITALFLOW_BUILD_ID__': JSON.stringify(buildId),
    },
    resolve: {
      alias: { '@': path.resolve('./') },
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react/jsx-runtime'],
      force: true,
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'lucide-react'],
            charts: ['recharts'],
            utils: ['exceljs'],
          },
        },
      },
    },
  };
});
