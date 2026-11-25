/**
 * `Analytics` adapter.
 *
 * - On a phone it is backed by posthog-react-native (`posthog.ts`), the
 *   only file that may import it.
 * - In a browser Metro picks `posthog.web.ts`: no analytics there until the
 *   web release (the web plan, phase 4). So the web build does not load
 *   the PostHog SDK (#690).
 */
export * from './posthog';
