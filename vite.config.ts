import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

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
