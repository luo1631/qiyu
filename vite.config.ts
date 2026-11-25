import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { open } from 'node:fs/promises';

const boatAsset = '/public/models/pond-boat-web.glb';
const boatFile = new URL('.' + boatAsset, import.meta.url);

export default defineConfig({
  base: './',
  plugins: [react(), {
    name: 'pond-buffered-boat-preview',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        if (url.pathname !== boatAsset || url.searchParams.has('import') || url.searchParams.has('url') ||
            (request.method !== 'GET' && request.method !== 'HEAD')) return next();
        try {
          // Close the Windows file handle before sending bytes over the socket.
          // A paused preview can then display the old bytes through a rebuild.
          const file = await open(boatFile);
          const snapshot = await (async () => {
            try {
              const { size, mtimeMs } = await file.stat();
              const etag = `W/"pond-${size}-${mtimeMs}"`;
              const unchanged = request.headers['if-none-match'] === etag;
              const bytes = request.method === 'GET' && !unchanged ? await file.readFile() : undefined;
              return { size, etag, unchanged, bytes };
            } finally {
              await file.close();
            }
          })();
          response.setHeader('ETag', snapshot.etag);
          response.setHeader('Cache-Control', 'no-cache');
          if (snapshot.unchanged) {
            response.statusCode = 304;
          } else {
            response.setHeader('Content-Type', 'model/gltf-binary');
            response.setHeader('Content-Length', snapshot.size);
          }
          response.end(snapshot.bytes);
        } catch (error) {
          next(error);
        }
      });
    },
  }],
  publicDir: false, // Only imported assets ship; editable SVGs and model sources stay local.
  server: { allowedHosts: ['terminal.local'] },
  build: {
    rollupOptions: {
      output: {
        // React must stay usable before the Three/R3F download finishes.
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three';
          if (id.includes('/node_modules/@react-three/')) return 'renderer';
        },
      },
    },
  },
});
