import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  publicDir: false, // Ship only assets referenced by the floating island.
  server: {
    allowedHosts: ['terminal.local'],
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/scripts/archive/**'] },
  },
  build: {
    rollupOptions: {
      output: {
        // Keep the React interface independent of the Three.js chunk.
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          if (id.includes('/node_modules/three/build/three.core.')) return 'three-core';
          if (id.includes('/node_modules/three/')) return 'three-renderer';
        },
      },
    },
  },
});
