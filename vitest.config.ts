import { defineConfig } from 'vitest/config'

// `npm run test` keeps the default Vitest include (all `**/*.{test,spec}...` files)
// but excludes the e2e/ folder so ordinary test runs never touch the real server.
// `npm run test:e2e` flakes in via process.env.JAZZ_E2E=1, which drops the e2e/
// exclusion and runs the e2e suite against the live rentgen remote.
const isE2E = process.env.JAZZ_E2E === '1'

export default defineConfig({
  test: {
    exclude: [
      ...(isE2E ? [] : ['e2e/**']),
      '**/node_modules/**',
      '**/.git/**',
    ],
  },
})
