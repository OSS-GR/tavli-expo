// Vite / Vitest can import any file as a string with `?raw`. Tests use this
// to read the rules docs, so preset values cannot drift from them, and to
// read test files, so the edge-case index cannot drift from the tests.
declare module '*.md?raw' {
  const text: string;
  export default text;
}

declare module '*.ts?raw' {
  const text: string;
  export default text;
}
