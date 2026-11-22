import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, 'index.html'),
        app: resolve(import.meta.dirname, 'app/index.html'),
        guide: resolve(import.meta.dirname, 'blog/swiggy-zomato-commission-calculator/index.html'),
        notfound: resolve(import.meta.dirname, '404.html'),
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
