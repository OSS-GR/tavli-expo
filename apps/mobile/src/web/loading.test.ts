import { LOADING_ID, showLoading } from './loading';

/** The few DOM calls the loading screen makes. Jest here has no browser. */
function fakeDocument() {
  interface Node {
    id: string;
    textContent: string;
    style: { cssText: string; backgroundColor: string };
    children: Node[];
    onclick: (() => void) | null;
    attrs: Record<string, string>;
    setAttribute: (name: string, value: string) => void;
    appendChild: (child: Node) => void;
    remove: () => void;
  }
  const reload = jest.fn();
  const make = (parent: () => Node | null): Node => {
    const node: Node = {
      id: '',
      textContent: '',
      style: { cssText: '', backgroundColor: '' },
      children: [],
      onclick: null,
      attrs: {},
      setAttribute: (name, value) => {
        node.attrs[name] = value;
      },
      appendChild: (child) => {
        node.children.push(child);
        owner.set(child, node);
      },
      remove: () => {
        const p = owner.get(node) ?? parent();
        if (p) p.children = p.children.filter((c) => c !== node);
      },
    };
    return node;
  };
  const owner = new Map<Node, Node>();
  const body = make(() => null);
  const doc = {
    body,
    createElement: () => make(() => null),
    defaultView: { location: { reload } },
  };
  return { doc: doc as unknown as Document, body, reload };
}

describe('the web loading screen', () => {
  it('shows at once, in the app colors, and goes when the app is ready', () => {
    const { doc, body } = fakeDocument();
    const loading = showLoading(doc);
    expect(body.style.backgroundColor).toBe('#3B2A1D');
    expect(body.children).toHaveLength(1);
    expect(body.children[0]?.id).toBe(LOADING_ID);
    expect(body.children[0]?.attrs.role).toBe('status');
    expect(body.children[0]?.children[0]?.textContent).toBe('Tavlaki');
    loading.done();
    expect(body.children).toHaveLength(0);
  });

  it('says so in both languages and offers a reload when CanvasKit fails', () => {
    const { doc, body, reload } = fakeDocument();
    showLoading(doc).failed();
    const box = body.children[0];
    expect(box?.children[0]?.textContent).toContain('did not load');
    expect(box?.children[0]?.textContent).toContain('δεν φόρτωσε');
    const again = box?.children[1];
    expect(again?.textContent).toContain('Try again');
    again?.onclick?.();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does nothing with no document (a native app never calls it)', () => {
    const loading = showLoading(undefined);
    expect(() => {
      loading.done();
      loading.failed();
    }).not.toThrow();
  });
});
