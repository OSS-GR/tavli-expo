// Vite / Vitest can import any file as a string with `?raw`. Tests use this
// to read the rules docs, so preset values cannot drift from them.
declare module '*.md?raw' {
  const text: string;
  export default text;
}
