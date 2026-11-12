import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const r = (path: string) => fileURLToPath(new URL(path, import.meta.url))

// Unit tests for pure code, most of them ported from upstream's node:test suite (tests/unit/*.test.mjs).
// They must not need Workers bindings: D1 is stood in for by node:sqlite (tests/unit/helpers), and
// anything that needs R2, queues or the email handler is exercised against `bun run preview` instead.
export default defineConfig({
  resolve: {
    alias: {
      '~': r('./app'),
      '#lib': r('./server/lib'),
      '#db': r('./server/db'),
      '#handlers': r('./server/handlers'),
      'cloudflare:workers': r('./tests/unit/helpers/cloudflare-workers.mjs'),
      'nitropack/runtime': r('./tests/unit/helpers/nitropack-runtime.mjs'),
      'better-sqlite3': r('./tests/unit/helpers/better-sqlite3.mjs'),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.{ts,mjs}'],
    restoreMocks: true,
    testTimeout: 30_000,
  },
})
