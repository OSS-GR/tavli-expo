/**
 * Download my data (#445): Settings → Account asks the server for the
 * copy (`OnlineData.exportMyData`, `MyData` in `@tavli/contracts`) and
 * opens the share sheet with it as JSON text. The player can save it to
 * Files, mail it or keep it in Notes.
 *
 * It uses React Native's own `Share` (no new native module, no file on
 * the phone): the share sheet gets the JSON as text, with a title that
 * names the file. Nothing is kept on the phone, and nothing goes to
 * analytics or the logs: the copy holds the email address of an email
 * key.
 */
import { isGameTransportErrorData, type MyData, type OnlineData } from '@tavli/contracts';

/** How long the copy may take before the app says it failed (no network: the call waits). */
export const EXPORT_TIME_LIMIT_MS = 30_000;

/** Why the download failed. */
export type DownloadProblem =
  /** No answer in time: most often no connection. */
  | 'network'
  /** The server has no account for this sign-in any more. */
  | 'signedOut'
  /** Anything else, the share sheet too. */
  | 'other';

/** What the share sheet gets. `Share.share` takes it. */
export interface ShareContent {
  readonly title: string;
  readonly message: string;
}

/** Opens the share sheet. Resolves when it closes, shared or not. */
export type ShareSheet = (content: ShareContent) => Promise<unknown>;

/** The copy did not answer in time. */
class ExportTimedOut extends Error {
  constructor() {
    super('the copy did not answer in time');
    this.name = 'ExportTimedOut';
  }
}

function withTimeLimit<T>(call: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ExportTimedOut()), ms);
    call.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error as Error);
      },
    );
  });
}

/** The file name the share sheet shows: `tavlaki-my-data-2026-11-17.json` (UTC day). */
export function myDataFileName(data: Pick<MyData, 'madeAt'>): string {
  return `tavlaki-my-data-${new Date(data.madeAt).toISOString().slice(0, 10)}.json`;
}

/** The JSON text of the copy, indented so a person can read it. */
export function myDataText(data: MyData): string {
  return JSON.stringify(data, null, 2);
}

function problemOf(error: unknown): DownloadProblem {
  if (error instanceof ExportTimedOut) return 'network';
  if (isGameTransportErrorData(error) && error.code === 'NOT_SIGNED_IN') return 'signedOut';
  return 'other';
}

/**
 * Gets the copy and opens the share sheet with it. Resolves `null` once
 * the sheet closed (also when the player shared nothing), or the problem.
 */
export async function downloadMyData(
  data: OnlineData,
  share: ShareSheet,
): Promise<DownloadProblem | null> {
  let copy: MyData;
  try {
    copy = await withTimeLimit(data.exportMyData(), EXPORT_TIME_LIMIT_MS);
  } catch (error) {
    return problemOf(error);
  }
  try {
    await share({ title: myDataFileName(copy), message: myDataText(copy) });
    return null;
  } catch {
    return 'other';
  }
}
