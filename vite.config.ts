import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  // Browser profiles/downloads are not source files. Watching their locked files
  // can crash the Windows dev server or trigger unrelated page reloads.
  server: { watch: { ignored: ['**/.qa/**'] } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
