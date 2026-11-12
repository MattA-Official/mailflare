import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const r = (path: string) => fileURLToPath(new URL(path, import.meta.url))

// Unit tests for pure code. They must not need Workers bindings; anything that touches D1, R2 or
// queues is exercised against `bun run preview` instead.
export default defineConfig({
  resolve: { alias: { '~': r('./app'), '#lib': r('./server/lib'), '#db': r('./server/db'), '#handlers': r('./server/handlers') } },
  test: { include: ['tests/unit/**/*.test.ts'] },
})
