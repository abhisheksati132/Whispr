import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'public/index.html')
      },
      output: {
        entryFileNames: 'public/dist/app.js',
        chunkFileNames: 'public/dist/chunks/[name]-[hash].js',
        assetFileNames: 'public/dist/assets/[name]-[hash].[ext]'
      }
    }
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': 'http://localhost:3000'
    }
  }
});
