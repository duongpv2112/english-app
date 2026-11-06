import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    globalSetup: ['test/globalSetup.ts'],
    // Tests share one database; run files one at a time.
    fileParallelism: false,
  },
})
