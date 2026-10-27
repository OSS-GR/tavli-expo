import { act, fireEvent, render, screen, userEvent, within } from '@testing-library/react-native';
import { checkersAt, totalCheckers } from '@tavli/engine';

import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import i18n from '@/i18n';
import el from '@/i18n/el.json';
import en from '@/i18n/en.json';

import {
  RULES_GAMES,
  RULES_PAGES,
  TAVLI_SECTION,
  paragraphs,
  parseRulesVariant,
  rulesDirection,
  rulesTitleKey,
  startBoard,
  type RulesKey,
  type RulesVariant,
} from './content';
import { RulesScreen } from './RulesScreen';

type Tree = { [key: string]: string | Tree };

/** All leaf keys as dotted paths, sorted. */
function leafKeys(tree: Tree, prefix: string): string[] {
  return Object.entries(tree)
    .flatMap(([key, value]) =>
      typeof value === 'string' ? [`${prefix}${key}`] : leafKeys(value, `${prefix}${key}.`),
    )
    .sort();
}

function leafValue(tree: Tree, path: string): string {
  const value = path
    .split('.')
    .reduce<string | Tree | undefined>(
      (node, part) => (typeof node === 'object' ? node[part] : undefined),
      tree,
    );
  if (typeof value !== 'string') throw new Error(`No string at ${path}`);
  return value;
}

const enRules = leafKeys(en.rules, 'rules.');
const elRules = leafKeys(el.rules, 'rules.');

const tr = (key: RulesKey) => i18n.t(key);

function show(variant: RulesVariant | null) {
  const onOpenRules = jest.fn();
  const view = render(<RulesScreen variant={variant} onOpenRules={onOpenRules} />);
  return { onOpenRules, view };
}

beforeEach(async () => {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS, language: 'en' });
  });
});

afterAll(async () => {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
  });
});

describe('rules texts', () => {
  it('has exactly the same rules keys in en and el', () => {
    expect(enRules.length).toBeGreaterThan(0);
    expect(elRules).toEqual(enRules);
  });

  it('has the same number of paragraphs in en and el', () => {
    for (const key of enRules) {
      const count = (tree: Tree) => paragraphs([leafValue(tree, key)]).length;
      expect({ key, count: count(el) }).toEqual({ key, count: count(en) });
    }
  });

  it('uses every rules key on some page', () => {
    const used = new Set<string>(
      [...RULES_GAMES.flatMap((game) => RULES_PAGES[game]), TAVLI_SECTION].flatMap((section) => [
        section.title,
        ...section.body,
      ]),
    );
    for (const id of ['portes', 'plakoto', 'fevga', 'asodio', 'tavli', null] as const) {
      used.add(rulesTitleKey(id));
    }
    for (const key of ['rules.unknown', 'rules.picture.label', 'rules.picture.caption']) {
      used.add(key);
    }
    expect(enRules.filter((key) => !used.has(key))).toEqual([]);
  });
});

describe('content', () => {
  it('reads the variant param', () => {
    expect(parseRulesVariant('plakoto')).toBe('plakoto');
    expect(parseRulesVariant(['fevga'])).toBe('fevga');
    expect(parseRulesVariant('asodio')).toBe('asodio');
    expect(parseRulesVariant('chess')).toBeNull();
    expect(parseRulesVariant(undefined)).toBeNull();
  });

  it('builds each start position from the default preset', () => {
    for (const game of RULES_GAMES) {
      const board = startBoard(game);
      expect(totalCheckers(board, 'white')).toBe(15);
      expect(totalCheckers(board, 'black')).toBe(15);
    }
    const portes = startBoard('portes');
    expect([24, 13, 8, 6].map((p) => checkersAt(portes, 'black', p, 'contrary'))).toEqual([
      2, 5, 3, 5,
    ]);
    expect(checkersAt(startBoard('plakoto'), 'black', 24, 'contrary')).toBe(15);
    // Fevga moves in parallel: Black's stack sits on White's point 12.
    expect(rulesDirection('fevga')).toBe('parallel');
    expect(startBoard('fevga').points[11]).toMatchObject({ black: 15, white: 0 });
    expect(startBoard('fevga').points[23]).toMatchObject({ white: 15, black: 0 });
    // Asodio: the board is empty, all 15 of each player are still to enter.
    const asodio = startBoard('asodio');
    expect(asodio.outside).toEqual({ white: 15, black: 15 });
    expect(asodio.points.every((p) => p.white === 0 && p.black === 0)).toBe(true);
  });
});

describe('<RulesScreen />', () => {
  it.each(RULES_GAMES)('shows every section of %s in order, with headers', async (game) => {
    await show(game).view;
    const sections = RULES_PAGES[game];
    expect(screen.getAllByRole('header').map((h) => h.props.children)).toEqual(
      sections.map((section) => tr(section.title)),
    );
    for (const section of sections) {
      const box = screen.getByTestId(`rules-section-${section.id}`);
      for (const line of paragraphs(section.body.map(tr))) {
        expect(within(box).getByText(line)).toBeOnTheScreen();
      }
    }
  });

  it('offers the tutorial on the Portes page only (#128)', async () => {
    const onLearnToPlay = jest.fn();
    const props = { onOpenRules: jest.fn(), onLearnToPlay };
    const view = await render(<RulesScreen variant="portes" {...props} />);
    await userEvent
      .setup()
      .press(screen.getByRole('button', { name: 'Learn to play on the board' }));
    expect(onLearnToPlay).toHaveBeenCalledTimes(1);
    await view.rerender(<RulesScreen variant="plakoto" {...props} />);
    expect(screen.queryByTestId('rules-learn-to-play')).not.toBeOnTheScreen();
  });

  it('has the sections the issue asks for', () => {
    const ids = (game: (typeof RULES_GAMES)[number]) => RULES_PAGES[game].map((s) => s.id);
    const shared = ['goal', 'start', 'moves', 'bearOff', 'scoring'];
    expect(ids('portes')).toEqual(expect.arrayContaining([...shared, 'hitting']));
    expect(ids('plakoto')).toEqual(expect.arrayContaining([...shared, 'pinning', 'mother']));
    expect(ids('fevga')).toEqual(
      expect.arrayContaining([...shared, 'noHitting', 'runner', 'primes']),
    );
    expect(ids('asodio')).toEqual(
      expect.arrayContaining([...shared, 'entering', 'quarters', 'pinning', 'draw']),
    );
  });

  it('draws the start position as a picture', async () => {
    await show('fevga').view;
    const picture = screen.getByRole('image', { name: 'The board at the start of Fevga' });
    expect(within(picture).queryByTestId('rules-board-fevga-canvas')).toBeNull();
    await act(async () => {
      fireEvent(screen.getByTestId('rules-board-fevga'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 334 } },
      });
    });
    expect(within(picture).getByTestId('rules-board-fevga-canvas')).toBeOnTheScreen();
  });

  it('explains the owner mother rule in Plakoto', async () => {
    await show('plakoto').view;
    const mother = screen.getByTestId('rules-section-mother');
    expect(
      within(mother).getByText(
        'If the other player pins your mother, you choose at the end of their turn: resign or play on.',
      ),
    ).toBeOnTheScreen();
  });

  it('shows Greek with tavli words', async () => {
    await act(async () => {
      settingsStore.setState({ language: 'el' });
    });
    await show('plakoto').view;
    expect(screen.getByRole('header', { name: 'Η μάνα' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Μάζεμα' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Βαθμοί' })).toBeOnTheScreen();
    expect(screen.getByRole('image', { name: 'Το ταμπλό στην αρχή: Πλακωτό' })).toBeOnTheScreen();
  });

  it('links to the three games from the Tavli page', async () => {
    const user = userEvent.setup();
    const { onOpenRules, view } = show('tavli');
    await view;
    expect(screen.getByRole('header', { name: 'A Tavli match' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'How to play Plakoto' }));
    expect(onOpenRules).toHaveBeenCalledWith('plakoto');
  });

  it('explains the owner rules of Asodio: the loading lock, quarters and the draw', async () => {
    await show('asodio').view;
    const entering = screen.getByTestId('rules-section-entering');
    expect(
      within(entering).getByText(
        'The board is locked until you roll a 1-2 (ασόδυο) or a double. Any other roll does nothing, and the turn passes.',
      ),
    ).toBeOnTheScreen();
    expect(
      within(entering).getByText(
        'A double enters four checkers on the same point: with 3-3, four checkers enter on point 22.',
      ),
    ).toBeOnTheScreen();
    expect(
      within(screen.getByTestId('rules-section-quarters')).getByText(/is frozen there/),
    ).toBeOnTheScreen();
    expect(
      within(screen.getByTestId('rules-section-draw')).getByText(/the game is a draw/),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('image', { name: 'The board at the start of Asodio' }),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('rules-unknown')).toBeNull();
  });

  it('links only the three Tavli games from the Tavli page (not Asodio)', async () => {
    await show('tavli').view;
    expect(screen.queryByRole('button', { name: 'How to play Asodio' })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('handles an unknown game', async () => {
    await show(null).view;
    expect(screen.getByText('There are no rules for this game.')).toBeOnTheScreen();
  });
});
