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
    port: 5175,
    proxy: {
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001', // Proxy für Datei-Downloads
      '/network-files': 'http://localhost:3001', // Proxy für Netzwerkdateien
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
});
