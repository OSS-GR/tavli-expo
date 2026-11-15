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
 * The test reads every shape of `StyleSheet.create`: an object, a factory
 * with an object body, or a factory whose every `return` is an object. Any
 * other shape fails, so nothing slips past unread.
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

function unwrap(node: ts.Expression): ts.Expression {
  let inner = node;
  while (ts.isParenthesizedExpression(inner) || ts.isAsExpression(inner)) inner = inner.expression;
  return inner;
}

function isObject(node: ts.Expression): boolean {
  return ts.isObjectLiteralExpression(unwrap(node));
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

/**
 * The style objects that `StyleSheet.create` gets: the object itself, the
 * body of a factory, or every `return` of a factory with a block body.
 * `null` when one of them is not an object written in place.
 */
function styleObjects(arg: ts.Expression | undefined): ts.ObjectLiteralExpression[] | null {
  if (!arg) return null;
  const value = unwrap(arg);
  if (ts.isObjectLiteralExpression(value)) return [value];
  if (!ts.isArrowFunction(value) && !ts.isFunctionExpression(value)) return null;
  if (!ts.isBlock(value.body)) {
    const body = unwrap(value.body);
    return ts.isObjectLiteralExpression(body) ? [body] : null;
  }
  const found: ts.ObjectLiteralExpression[] = [];
  let readable = true;
  const visit = (node: ts.Node) => {
    if (ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node)) {
      const returned = node.expression && unwrap(node.expression);
      if (returned && ts.isObjectLiteralExpression(returned)) found.push(returned);
      else readable = false;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(value.body, visit);
  return readable && found.length > 0 ? found : null;
}

/** The problems in one file's text; `name` goes in front of each line. */
function problemsIn(name: string, text: string): string[] {
  const found: string[] = [];
  const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const where = (node: ts.Node) =>
    `${name}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'StyleSheet.create') {
      const sheets = styleObjects(node.arguments[0]);
      if (sheets === null)
        found.push(`${where(node)}: a \`StyleSheet.create\` shape this test cannot read`);
      for (const styles of sheets ?? []) {
        for (const prop of styles.properties) {
          if (!ts.isPropertyAssignment(prop)) {
            found.push(`${where(prop)}: not a plain \`name: style\` entry`);
            continue;
          }
          const bad = problem(prop.initializer);
          if (bad) found.push(`${where(prop)} ${prop.name.getText(source)}: ${bad}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function findProblems(): string[] {
  return sourceFiles(SRC).flatMap((file) => {
    const text = readFileSync(file, 'utf8');
    return text.includes('StyleSheet.create') ? problemsIn(relative(SRC, file), text) : [];
  });
}

describe('StyleSheet.create shapes', () => {
  it('writes every themed style as an object, so a theme change repaints it', () => {
    expect(findProblems()).toEqual([]);
  });
});

describe('the shape check', () => {
  it('passes objects, factories and functions that return objects', () => {
    const text = `
      const a = StyleSheet.create({ box: { flex: 1 } });
      const b = StyleSheet.create((theme) => ({ box: { ...surfaceStyle(theme, 'tray') } }));
      const c = StyleSheet.create((theme) => {
        return { box: (on: boolean) => ({ opacity: on ? 1 : 0.5 }) };
      });`;
    expect(problemsIn('ok.tsx', text)).toEqual([]);
  });

  it('catches a bare call, a ternary and a factory it cannot read', () => {
    const text = `
      const a = StyleSheet.create((theme) => ({
        frame: surfaceStyle(theme, 'tray'),
        box: (on: boolean) => (on ? {} : { opacity: 0.5 }),
      }));
      const b = StyleSheet.create((theme) => {
        return { frame: surfaceStyle(theme, 'tray') };
      });
      const c = StyleSheet.create((theme) => makeStyles(theme));
      const d = StyleSheet.create((theme) => {
        const s = makeStyles(theme);
        return s;
      });`;
    expect(problemsIn('bad.tsx', text)).toEqual([
      'bad.tsx:3 frame: not an object written in place',
      'bad.tsx:4 box: a function that returns no `{ ... }`',
      'bad.tsx:7 frame: not an object written in place',
      'bad.tsx:9: a `StyleSheet.create` shape this test cannot read',
      'bad.tsx:10: a `StyleSheet.create` shape this test cannot read',
    ]);
  });
});
