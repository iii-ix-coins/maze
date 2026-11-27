import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const siteRouteManifest = JSON.parse(
  fs.readFileSync(path.resolve(root, 'shared/site-routes.json'), 'utf8'),
);
const siteDefaultTitle = siteRouteManifest.routes.find((route: { id: string }) => route.id === 'home')?.title;
if (typeof siteDefaultTitle !== 'string' || !siteDefaultTitle.trim()) {
  throw new Error('The shared site route manifest must define the home page title.');
}

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
        transformIndexHtml(html) {
          const safeUrl = mazePublicUrl
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;');
          const safeTitle = siteDefaultTitle
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          return html
            .replace('<!-- @site-default-title -->', safeTitle)
            .replace(
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
        },
      },
      outDir: path.resolve(root, 'dist/site'),
      emptyOutDir: true,
      manifest: true,
      sourcemap: false,
      target: [
        'safari13.1',
        'ios13.4',
        'chrome80',
        'firefox74',
        'edge80'
      ],

      cssTarget: [
        'safari13.1',
        'ios13.4',
        'chrome80',
        'firefox74',
        'edge80'
      ],
      assetsDir: 'assets',
      // Keep classic compatibility scripts as files; data: URLs can be blocked by
      // stricter browser policies and do not preserve the previous script loading model.
      assetsInlineLimit: 0,
    },
  };
});
