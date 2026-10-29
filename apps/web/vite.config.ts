import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    // maplibre-gl alone is ~1.1 MB minified (already its own chunk); don't warn about it.
    chunkSizeWarningLimit: 1200,
  },
  server: {
    proxy: {
      // GraphHopper (services/routing). Same-origin from the browser's point of view, so no CORS setup.
      '/gh': {
        target: 'http://localhost:8989',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gh/, ''),
      },
    },
  },
});
