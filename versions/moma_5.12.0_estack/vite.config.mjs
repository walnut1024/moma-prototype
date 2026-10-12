import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { copyFileSync, mkdirSync } from 'node:fs';

const outDir = path.resolve(import.meta.dirname, '../../public/moma_5.12.0_estack');

export default defineConfig({
  root: import.meta.dirname,
  base: '/moma_5.12.0_estack/',
  resolve: { alias: { '@': path.join(import.meta.dirname, 'src') } },
  build: {
    outDir,
    emptyOutDir: true,
  },
  plugins: [react(), tailwindcss(), {
    name: 'standalone-order-entry',
    closeBundle() {
      const orderDir = path.join(outDir, 'order/serviceOrder');
      mkdirSync(orderDir, { recursive: true });
      copyFileSync(path.join(outDir, 'index.html'), path.join(orderDir, 'index.html'));
    },
  }],
});
