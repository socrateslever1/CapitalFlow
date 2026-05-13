import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      tailwindcss(),
      spaFallbackPlugin(),
    ],
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || env.VITE_GOOGLE_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve('./'),
      },
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
            utils: ['xlsx'],
          },
        },
      },
    },
  };
});
