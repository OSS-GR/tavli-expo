import { render } from '@testing-library/react-native';

import { Icon } from './Icon.web';
import { ICONS, type IconName } from './icons';

interface Node {
  type: string;
  props: Record<string, unknown>;
  children: (Node | string)[] | null;
}

/** Every node of a rendered tree, top first. */
function nodes(tree: Node): Node[] {
  const kids = (tree.children ?? []).filter((c): c is Node => typeof c !== 'string');
  return [tree, ...kids.flatMap(nodes)];
}

async function drawn(name: IconName, props: { size?: number; strokeWidth?: number } = {}) {
  const view = await render(<Icon name={name} color="#C9A24B" testID="icon" {...props} />);
  return nodes(view.toJSON() as unknown as Node);
}

describe('Icon in a browser (SVG)', () => {
  it('draws every icon from the same path data as the phone', async () => {
    for (const name of Object.keys(ICONS) as IconName[]) {
      const shape: { strokes: readonly string[]; fills?: readonly string[] } = ICONS[name];
      const all = await drawn(name);
      const paths = all.filter((n) => n.type === 'path');
      expect(paths.map((p) => p.props.d)).toEqual([...shape.strokes, ...(shape.fills ?? [])]);
      const strokes = paths.slice(0, shape.strokes.length);
      expect(strokes.every((p) => p.props.stroke === '#C9A24B')).toBe(true);
      expect(paths.slice(shape.strokes.length).every((p) => p.props.fill === '#C9A24B')).toBe(true);
    }
  });

  it('uses no canvas, keeps the 24 grid, and follows size and line width', async () => {
    const name = Object.keys(ICONS)[0] as IconName;
    const all = await drawn(name, { size: 40, strokeWidth: 1.6 });
    expect(all.some((n) => n.type.toLowerCase().includes('canvas'))).toBe(false);
    const svg = all.find((n) => n.type === 'svg');
    expect(svg?.props).toMatchObject({ width: 40, height: 40, viewBox: '0 0 24 24' });
    const stroke = all.find((n) => n.type === 'path' && n.props.stroke !== undefined);
    expect(stroke?.props).toMatchObject({
      strokeWidth: 1.6,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    });
  });

  it('is hidden from screen readers and takes no touches', async () => {
    const all = await drawn(Object.keys(ICONS)[0] as IconName);
    const box = all[0];
    expect(box?.props['aria-hidden']).toBe(true);
    expect(box?.props.style).toMatchObject({ pointerEvents: 'none' });
  });
});
