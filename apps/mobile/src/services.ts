/**
 * The one place where the app picks its adapters (ADR-0002).
 * Everything else imports ports from `@tavli/contracts` and gets the
 * real implementation from here.
 *
 * Jest replaces this module with in-memory fakes (`jest.setup.ts`).
 */
import type { Storage } from '@tavli/contracts';
import { createMmkvStorage } from '@tavli/storage-mmkv';

export const storage: Storage = createMmkvStorage({ id: 'tavlaki' });
