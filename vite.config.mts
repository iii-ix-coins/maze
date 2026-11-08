import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, '');
  const mazePublicUrl = String(
    env.MAZE_PUBLIC_URL || process.env.MAZE_PUBLIC_URL || '',
  ).trim();

  return {
    root,
    base: '/',
    publicDir: path.resolve(root, 'public'),
    plugins: [
      react(),
      {
        name: 'maze-public-websocket-url',
        transformIndexHtml(html: string) {
          const safeUrl = mazePublicUrl
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;');
          return html.replace(
            /(<meta\s+name="maze-multiplayer-url"\s+content=)"[^"]*"/i,
            `$1"${safeUrl}"`,
          );
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(root, 'src'),
        '@maze/shared': path.resolve(root, 'shared/maze/src/index.ts'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': { target: 'http://127.0.0.1:5000', changeOrigin: true },
        '/health': { target: 'http://127.0.0.1:5000', changeOrigin: true },
        '/rooms': { target: 'http://127.0.0.1:8081', changeOrigin: true },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
      strictPort: true,
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(root, 'index.html'),
          coin: path.resolve(root, 'coin.html'),
          holders: path.resolve(root, 'holders.html'),
          market: path.resolve(root, 'market.html'),
        },
      },
      outDir: path.resolve(root, 'dist/site'),
      emptyOutDir: true,
      manifest: true,
      sourcemap: false,
      target: 'es2022',
      assetsDir: 'assets',
      // Keep classic compatibility scripts as files; data: URLs can be blocked by
      // stricter browser policies and do not preserve the previous script loading model.
      assetsInlineLimit: 0,
    },
  };
});
