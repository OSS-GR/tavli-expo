/**
 * A theme change repaints a style only when the Unistyles Babel plugin
 * tagged it, and the plugin tags only a style written as an object right
 * in `StyleSheet.create`: `{ ... }`, or a function whose body is `{ ... }`
 * or a block that returns `{ ... }`. A bare call (`frame:
 * surfaceStyle(theme, 'tray')`) or a `? :` between two objects gets no tag,
 * so the view keeps its old colors until its screen renders again. Spread
 * the helper into an object instead: `frame: { ...surfaceStyle(theme,
 * 'tray') }`.
 *
 * Jest cannot see this (the Unistyles mock styles with one theme), so
 * this test reads the source.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';

const SRC = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

function isObject(node: ts.Node): boolean {
  let inner = node;
  while (ts.isParenthesizedExpression(inner) || ts.isAsExpression(inner)) inner = inner.expression;
  return ts.isObjectLiteralExpression(inner);
}

/** What is wrong with one style, or `null` when the plugin can tag it. */
function problem(value: ts.Expression): string | null {
  if (isObject(value)) return null;
  if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) {
    if (!ts.isBlock(value.body))
      return isObject(value.body) ? null : 'a function that returns no `{ ... }`';
    let bad: string | null = null;
    const visit = (node: ts.Node) => {
      if (ts.isFunctionLike(node)) return;
      if (ts.isReturnStatement(node) && node.expression && !isObject(node.expression)) {
        bad = 'a `return` of something other than `{ ... }`';
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(value.body, visit);
    return bad;
  }
  return 'not an object written in place';
}

function findProblems(): string[] {
  const found: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('StyleSheet.create')) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && node.expression.getText(source) === 'StyleSheet.create') {
        const factory = node.arguments[0];
        const body =
          factory &&
          (ts.isArrowFunction(factory) || ts.isFunctionExpression(factory)) &&
          !ts.isBlock(factory.body)
            ? factory.body
            : undefined;
        let styles = body;
        while (styles && ts.isParenthesizedExpression(styles)) styles = styles.expression;
        if (styles && ts.isObjectLiteralExpression(styles)) {
          for (const prop of styles.properties) {
            const line = source.getLineAndCharacterOfPosition(prop.getStart(source)).line + 1;
            const where = `${relative(SRC, file)}:${line}`;
            if (!ts.isPropertyAssignment(prop)) {
              found.push(`${where}: not a plain \`name: style\` entry`);
              continue;
            }
            const bad = problem(prop.initializer);
            if (bad) found.push(`${where} ${prop.name.getText(source)}: ${bad}`);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}

describe('StyleSheet.create shapes', () => {
  it('writes every themed style as an object, so a theme change repaints it', () => {
    expect(findProblems()).toEqual([]);
  });
});
