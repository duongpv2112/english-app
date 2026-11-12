import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Reuses the api's test database setup (embedded Postgres or TEST_DATABASE_URL, plus migrations).
    globalSetup: ['../../apps/api/test/globalSetup.ts'],
    fileParallelism: false,
  },
})
