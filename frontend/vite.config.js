import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Multi-tenant por subdomínio: em dev usamos <slug>.localhost:5173.
    // Navegadores resolvem *.localhost para 127.0.0.1 sem mexer no hosts.
    allowedHosts: ['localhost', '.localhost', '127.0.0.1'],
    proxy: {
      // changeOrigin: false é essencial — o backend identifica o condomínio
      // pelo header Host, que seria reescrito para localhost:3001 se true.
      '/api':     { target: proxyTarget, changeOrigin: false },
      '/uploads': { target: proxyTarget, changeOrigin: false },
    },
  },
  build: {
    outDir: '../backend/public',
    emptyOutDir: true,
  },
});
