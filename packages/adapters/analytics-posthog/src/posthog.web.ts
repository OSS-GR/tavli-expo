/**
 * The browser twin of `posthog.ts` (#690): analytics send nothing on the
 * web for now, so the web build does not download the PostHog SDK. The
 * opt-in answer is still kept, as the port asks. Analytics for the web
 * come in phase 4 of `docs/architecture/web-app.md`, with the web privacy
 * text.
 */
import { createNoopAnalytics, type Analytics, type Storage } from '@tavli/contracts';

export interface PostHogAnalyticsOptions {
  apiKey: string;
  storage: Storage;
  host?: string;
  appVersion?: string;
}

export const createPostHogAnalytics: (options: PostHogAnalyticsOptions) => Analytics = () =>
  createNoopAnalytics();
