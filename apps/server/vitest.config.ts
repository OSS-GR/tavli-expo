import { defineConfig } from 'vitest/config';

// convex-test runs the Convex functions in the edge runtime (`@edge-runtime/vm`),
// close to the real Convex runtime. See docs/architecture/online-game-service.md.
export default defineConfig({
  test: {
    environment: 'edge-runtime',
    server: { deps: { inline: ['convex-test'] } },
  },
});
