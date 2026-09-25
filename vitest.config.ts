import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Server-side modules under test run in node: no DOM, no React render, no
    // jsdom cost. Hooks are covered through the pure helpers they are built from.
    environment: 'node',
    globals: true,
    include: ['lib/**/*.test.{ts,tsx}', 'hooks/**/*.test.{ts,tsx}', 'components/**/*.test.tsx'],
    // Component suites opt into a DOM per file with an `@vitest-environment`
    // docblock, so the jsdom startup cost is paid only where it is needed.
    setupFiles: ['./vitest.setup.ts'],
    // Upstream calls are stubbed per test, so nothing here may reach the network.
    restoreMocks: true
  },
  esbuild: {
    // The app itself compiles through Next's SWC pipeline, which already uses
    // the automatic JSX runtime. Vitest transpiles on its own and would fall
    // back to the classic runtime, where every component file needs `React` in
    // scope. Naming the runtime here keeps test files written the same way as
    // the components they cover.
    jsx: 'automatic',
    jsxImportSource: 'react'
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url))
    }
  }
});
