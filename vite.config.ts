/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: ['e2e/**', 'node_modules/**'],
  },
  server: {
    host: true,
    port: parseInt(process.env.APP_PORT || '5007'),
    proxy: {
      '/api': 'http://localhost:3002',
      '/uploads': 'http://localhost:3002', // Proxy für Datei-Downloads
      '/network-files': 'http://localhost:3002', // Proxy für Netzwerkdateien
      '/ws': {
        target: 'ws://localhost:3002',
        ws: true,
      },
    },
  },
});
