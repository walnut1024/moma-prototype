import {validateApplicationConfig} from './src/mock/application-data.js';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { createRequire } from 'node:module';
import { validateModelDataset, validateSystemModelData } from './src/mock/model-data.js';
import { copyFileSync, mkdirSync } from 'node:fs';

const outDir = path.resolve(import.meta.dirname, '../../public/moma_5.12.0_estack');
const semiPackage = createRequire(import.meta.url).resolve('@douyinfe/semi-ui');
const semiDate = (source, importer) => importer?.includes('/date-fns-tz/') && source.startsWith('date-fns/') ? createRequire(semiPackage).resolve(source) : null;

export default defineConfig({
  root: import.meta.dirname,
  base: '/moma_5.12.0_estack/',
  resolve: { alias: { '@': path.join(import.meta.dirname, 'src') } },
  optimizeDeps: { esbuildOptions: { plugins: [{ name: 'semi-date-fns', setup(build) {
    build.onResolve({ filter: /^date-fns\// }, ({ path: source, importer }) => {
      const path = semiDate(source, importer); if (path) return { path };
    });
  } }] } },
  server: { host: '127.0.0.1', proxy: { '/api/5120': { target:'http://127.0.0.1:'+Number(process.env.MOMA_5120_BACKEND_PORT || 8787), changeOrigin: false } } },
  build: {
    outDir,
    emptyOutDir: true,
  },
  plugins: [{
    name: 'semi-date-fns',
    // Semi's date-fns-tz 1.x needs Semi's date-fns 2.x, while the application uses 4.x.
    enforce: 'pre',
    resolveId(source, importer) {
      return semiDate(source, importer);
    },
  }, react(), tailwindcss(), {
    name: 'standalone-order-entry',
    buildStart() { validateModelDataset(); validateSystemModelData(); validateApplicationConfig(); },
    closeBundle() {
      const orderDir = path.join(outDir, 'order/serviceOrder');
      mkdirSync(orderDir, { recursive: true });
      copyFileSync(path.join(outDir, 'index.html'), path.join(orderDir, 'index.html'));
    },
  }],
});
