// `import.meta.glob` from Vite (Vitest). Only tests use it (`test.setup.ts`).
interface ImportMeta {
  glob(pattern: string | readonly string[]): Record<string, () => Promise<unknown>>;
}
