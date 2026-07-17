import { defineConfig } from 'vitest/config'

// Minimal test yapılandırması — yalnızca saf TypeScript modülleri (motor + teklif guardrail)
// test edilir. DOM ortamı, UI testi, coverage hedefi bilinçli olarak YOKTUR.
// Vite eklentileri (react, PWA) testler için gereksiz olduğundan ana vite.config.ts'ten
// bağımsız tutulmuştur; böylece testler saniyeler içinde koşar.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
