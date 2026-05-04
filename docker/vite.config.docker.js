// vite.config.docker.js — configuração usada durante o build Docker
// O outDir aponta para backend/public dentro do contexto do container
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // No Docker, o build acontece em /build/frontend e a saída
    // vai para /build/backend/public (copiado depois para /app/backend/public)
    outDir: '/build/backend/public',
    emptyOutDir: true,
    // Otimizações para produção
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Chunks menores para carregamento mais rápido no mobile
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  // No container não há servidor de dev
  server: {
    port: 5173,
  },
});
