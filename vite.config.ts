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
 * - o Extrato consolida as duas pernas do mesmo recebimento (capital + lucro) em uma linha.
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

      if (id.endsWith('/pages/FinancialStatementPage.tsx')) {
        const anchor = `  const caixaLivre = operationalSources.find((source) =>\n    /caixa livre|lucro|dispon[ií]vel/i.test(source.name || '')\n  );`;
        const grouped = `  const displayMovements = useMemo<Movement[]>(() => {\n    const groupedByPayment = new Map<string, Movement>();\n    const standalone: Movement[] = [];\n\n    filteredMovements.forEach((movement) => {\n      const category = String(movement.category || '').toUpperCase();\n      const key = getPaymentGroupKey(movement);\n      const isPaymentPart = movement.direction === 'IN' && Boolean(key) && ['PAGAMENTO', 'LUCRO'].includes(category) && !movement.reversedOfTransactionId;\n\n      if (!isPaymentPart) {\n        standalone.push(movement);\n        return;\n      }\n\n      const existing = groupedByPayment.get(key);\n      if (!existing) {\n        groupedByPayment.set(key, {\n          ...movement,\n          id: 'payment-group-' + key,\n          notes: 'Recebimento consolidado',\n          sourceName: movement.sourceName,\n        });\n        return;\n      }\n\n      const sources = new Set([existing.sourceName, movement.sourceName].filter(Boolean));\n      groupedByPayment.set(key, {\n        ...existing,\n        amount: Number(existing.amount || 0) + Number(movement.amount || 0),\n        principalDelta: Number(existing.principalDelta || 0) + Number(movement.principalDelta || 0),\n        interestDelta: Number(existing.interestDelta || 0) + Number(movement.interestDelta || 0),\n        lateFeeDelta: Number(existing.lateFeeDelta || 0) + Number(movement.lateFeeDelta || 0),\n        operatorId: existing.operatorId || movement.operatorId,\n        sourceName: Array.from(sources).join(' + '),\n      });\n    });\n\n    return [...groupedByPayment.values(), ...standalone]\n      .sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime());\n  }, [filteredMovements]);\n\n${anchor}`;

        return source
          .replace(anchor, grouped)
          .replace("filteredMovements.length > 0 ? (", "displayMovements.length > 0 ? (")
          .replace("filteredMovements.map((movement) => {", "displayMovements.map((movement) => {")
          .replace("movement.operatorId ? movement.operatorId.slice(0, 8).toUpperCase() : 'não registrado'", "movement.operatorId === profileId ? 'VOCÊ' : movement.operatorId ? movement.operatorId.slice(0, 8).toUpperCase() : 'NÃO REGISTRADO'");
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
