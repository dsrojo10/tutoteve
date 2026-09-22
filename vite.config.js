import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    allowedHosts: ['.ngrok-free.app']
  },
  build: {
    target: 'es2017',
    rollupOptions: {
      input: {
        sender: resolve(import.meta.dirname, 'index.html'),
        tv: resolve(import.meta.dirname, 'tv.html')
      }
    }
  }
});
