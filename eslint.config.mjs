import withNuxt from './.nuxt/eslint.config.mjs'

// Ported upstream server code keeps upstream's style so it can be diffed against legacy/ and upstream.
export default withNuxt({
  ignores: ['legacy/**', 'server/lib/**', 'server/db/**', 'server/handlers/**', 'server/api/**', 'server/routes/**', 'server/worker.ts', 'server/worker/**', 'server/realtime/**', 'shared/types/env.d.ts', 'tests/unit/**/*.test.mjs'],
})
