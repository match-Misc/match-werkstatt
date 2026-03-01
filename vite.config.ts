import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    port: 5175,
    proxy: {
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001', // Proxy für Datei-Downloads
      '/network-files': 'http://localhost:3001', // Proxy für Netzwerkdateien
    },
  },
});
