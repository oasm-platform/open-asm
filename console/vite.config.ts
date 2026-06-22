import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { devtools } from '@tanstack/devtools-vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ''); // load .env file

  return {
    plugins: [
      ...(mode === 'development' ? [devtools()] : []),
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: false,
      }),
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['radar.svg', 'icon-192.svg'],
        manifest: {
          id: '/',
          name: 'OpenASM - AI Agent Management Platform',
          short_name: 'OpenASM',
          description:
            'AI agent management and automation platform with MCP integration',
          scope: '/',
          start_url: '/',
          lang: 'en',
          theme_color: '#3b5bdb',
          background_color: '#fbfbfd',
          display: 'standalone',
          orientation: 'portrait-primary',
          icons: [
            {
              src: 'icon-192.svg',
              sizes: '192x192',
              type: 'image/svg+xml',
              purpose: 'any',
            },
            {
              src: 'icon-192.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],
          swDest: 'sw.js',
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    logLevel: 'silent',
    server: {
      watch: {
        usePolling: true,
      },
      host: true,
      port: 5173,
      allowedHosts: true,
      proxy: {
        '/api': {
          target: env.VITE_API_URL,
          changeOrigin: true,
          logLevel: 'silent',
        },
      },
    },
  };
});
