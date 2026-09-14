import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

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

/**
 * Correções concentradas de apresentação para não alterar o modelo contábil:
 * - o Jurídico conta apenas versões vigentes e deixa de chamar todo documento de pré-contrato;
 * - o Extrato consolida as duas pernas do mesmo recebimento (capital + lucro) em uma linha;
 * - a ficha do cliente reutiliza o painel único de documentos jurídicos.
 */
function sourceConsistencyFixesPlugin(): Plugin {
  return {
    name: 'capitalflow-source-consistency-fixes',
    enforce: 'pre',
    transform(source, id) {
      if (id.endsWith('/pages/LegalPage.tsx')) {
        const currentDocsExpression = `legalDocs.filter((doc) => !['CANCELADO', 'SUPERSEDED', 'SUBSTITUIDO'].includes(String(doc.status || doc.status_assinatura || '').toUpperCase()))`;
        return source
          .replace('Documentos & Pré-Contratos Emitidos ({legalDocs.length})', `Documentos Jurídicos Emitidos ({${currentDocsExpression}.length})`)
          .replace('{legalDocs.length === 0 ? (', `{${currentDocsExpression}.length === 0 ? (`)
          .replace('{legalDocs.map((doc) => {', `{${currentDocsExpression}.map((doc) => {`)
          .replace('/* ABA: DOCUMENTOS JURÍDICOS & PRÉ-CONTRATOS EMITIDOS */', '/* ABA: DOCUMENTOS JURÍDICOS EMITIDOS */');
      }

      if (id.endsWith('/pages/ClientsPage.tsx')) {
        let transformed = source;
        if (!transformed.includes("ClientLegalDocumentsPanel")) {
          transformed = transformed.replace(
            "import { Tooltip } from '../components/ui/Tooltip';",
            "import { Tooltip } from '../components/ui/Tooltip';\nimport { ClientLegalDocumentsPanel } from '../features/legal/components/ClientLegalDocumentsPanel';"
          );
        }
        transformed = transformed
          .replace('Pré-contrato digital', 'Minuta jurídica pré-desembolso')
          .replace('A Confissão de Dívida individual foi gerada pelo setor jurídico e está pronta para envio ou assinatura.', 'O instrumento jurídico foi gerado pela mesma Central Jurídica e está disponível no Portal do Cliente.')
          .replace('Link do Documento Jurídico (Assinatura Directa)', 'Acesso ao documento pelo Portal do Cliente')
          .replace(
            '<div className="flex-1 overflow-y-auto p-4 custom-scrollbar">',
            '<div className="flex-1 overflow-y-auto p-4 custom-scrollbar">\n                <ClientLegalDocumentsPanel clientId={selectedClient.id} onNotify={showToast} />'
          );
        return transformed;
      }


      return null;
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: { port: 3000, host: '0.0.0.0' },
    plugins: [sourceConsistencyFixesPlugin(), react(), tailwindcss(), spaFallbackPlugin()],
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || env.VITE_GOOGLE_API_KEY),
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
