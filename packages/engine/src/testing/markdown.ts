/**
 * Small Markdown readers for tests that check code against the docs. Not
 * exported from the package.
 */

/** The text under a heading, up to the next heading of any level. */
export function section(doc: string, heading: string): string {
  const start = doc.indexOf(`${heading}\n`);
  if (start < 0) throw new Error(`no section "${heading}"`);
  const rest = doc.slice(start + heading.length + 1);
  const end = rest.search(/^#{1,6} /m);
  return end < 0 ? rest : rest.slice(0, end);
}

/**
 * The table rows in `text`, as trimmed cells. Keeps the lines that match
 * `row`; the default (a first cell in `code`) skips the header and `|---|`.
 */
export function tableRows(text: string, row: RegExp = /^\| `/): string[][] {
  return text
    .split('\n')
    .filter((line) => row.test(line))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
}
