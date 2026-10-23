import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@nestjs/swagger': path.resolve(__dirname, './src/server/shims/swagger.ts'),
      '@nestjs/core': path.resolve(__dirname, './src/server/shims/core.ts'),
      '@nestjs/testing': path.resolve(__dirname, './src/server/shims/testing.ts'),
    },
  },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
    exclude: ['backend/**', 'frontend/**', 'node_modules/**', '.next/**'],
  },
});
