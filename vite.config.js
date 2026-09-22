import { defineConfig } from 'vite';

export default defineConfig({
  base: '/tutoteve/',
  build: { rollupOptions: { input: { index: 'index.html', tv: 'tv.html' } } }
});
