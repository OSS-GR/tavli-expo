// Vite / Vitest can import any file as a string with `?raw`. Tests use this
// to read docs, so code and docs cannot drift apart.
declare module '*.md?raw' {
  const text: string;
  export default text;
}
