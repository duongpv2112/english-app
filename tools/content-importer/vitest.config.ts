import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Same database setup as the API tests; this package depends on @english-app/api,
    // so `pnpm -r test` runs it after the API suite instead of alongside it.
    globalSetup: ['../../apps/api/test/globalSetup.ts'],
    fileParallelism: false,
  },
})
