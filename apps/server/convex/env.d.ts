// Convex functions read the deployment's env vars from `process.env`.
// The server has no Node types, so this declares only that part.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };
