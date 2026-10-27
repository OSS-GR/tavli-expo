import {
  DEFAULT_PRESET_BY_GAME,
  currentBoard,
  formatMove,
  getPreset,
  legalNextMoves,
  type GameFlow,
} from '@tavli/engine';

import { armyFrozen, frozenPoints } from '@/features/board/asodio';

import {
  LESSONS,
  LESSON_SETS,
  lessonMoves,
  playLessonMove,
  startLesson,
  type LessonId,
} from './lessons';

const ALL_LESSONS = Object.values(LESSON_SETS).flat();

const lesson = (id: LessonId) => {
  const found = ALL_LESSONS.find((l) => l.id === id);
  if (!found) throw new Error(id);
  return found;
};

/** What the board offers now, as notation (`13/9`). */
const offered = (id: LessonId, flow: GameFlow) =>
  lessonMoves(lesson(id), flow)
    .flatMap((g) => g.moves)
    .map(formatMove)
    .sort();

/** What the engine allows now, before the lesson filters it. */
const engineMoves = (flow: GameFlow) =>
  legalNextMoves(flow)
    .flatMap((g) => g.moves)
    .map(formatMove)
    .sort();

/** Plays the first offered move until the lesson is done. */
function playThrough(id: LessonId): { flow: GameFlow; moves: string[] } {
  let flow = startLesson(lesson(id));
  const moves: string[] = [];
  for (let i = 0; i < 4 && !lesson(id).done(flow); i++) {
    const move = lessonMoves(lesson(id), flow)[0]?.moves[0];
    if (!move) throw new Error(`${id}: no move offered`);
    const next = playLessonMove(lesson(id), flow, move);
    if (!next) throw new Error(`${id}: offered move refused`);
    moves.push(formatMove(move));
    flow = next;
  }
  return { flow, moves };
}

describe('tutorial lessons', () => {
  it('has the seven lessons of the issue, in order', () => {
    expect(LESSONS.map((l) => l.id)).toEqual([
      'move',
      'bothDice',
      'double',
      'makePoint',
      'hit',
      'enter',
      'bearOff',
    ]);
  });

  it('has four lessons each for Plakoto, Fevga (#149) and Asodio (#159), with ids unique over all games', () => {
    expect(LESSON_SETS.portes).toBe(LESSONS);
    expect(LESSON_SETS.plakoto.map((l) => l.id)).toEqual([
      'pin',
      'pinned',
      'mother',
      'plakotoBearOff',
    ]);
    expect(LESSON_SETS.fevga.map((l) => l.id)).toEqual([
      'sameWay',
      'holdPoint',
      'runner',
      'sixInARow',
    ]);
    expect(LESSON_SETS.asodio.map((l) => l.id)).toEqual([
      'aceDeuce',
      'enterAll',
      'quarterLock',
      'pinLast',
    ]);
    const ids = ALL_LESSONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [game, lessons] of Object.entries(LESSON_SETS)) {
      for (const l of lessons) expect(l.game).toBe(game);
    }
  });

  it.each(ALL_LESSONS.map((l) => l.id))(
    '%s starts in its game, White to move, fixed dice',
    (id) => {
      const flow = startLesson(lesson(id));
      const { game } = lesson(id);
      expect(flow.state.variant).toBe(game);
      // The app's default preset: Plakoto offerConcede, Fevga runner rule
      // and bans, Asodio the owner version (asodio.kafeneio).
      expect(flow.state.rules).toEqual(getPreset(DEFAULT_PRESET_BY_GAME[game]));
      expect(flow.phase).toBe('moving');
      expect(flow.state.toMove).toBe('white');
      expect(flow.state.dice).toEqual(lesson(id).dice);
      // The same start every time: no RNG.
      expect(startLesson(lesson(id))).toEqual(flow);
      expect(lessonMoves(lesson(id), flow).length).toBeGreaterThan(0);
    },
  );

  it.each(ALL_LESSONS.map((l) => l.id))('%s can be finished with the moves it offers', (id) => {
    const { flow } = playThrough(id);
    expect(lesson(id).done(flow)).toBe(true);
    // Nothing more to touch once it is done.
    expect(lessonMoves(lesson(id), flow)).toEqual([]);
  });

  it('1: offers only the lit checker with the 4', () => {
    expect(offered('move', startLesson(lesson('move')))).toEqual(['13/9']);
    expect(playThrough('move').moves).toEqual(['13/9']);
  });

  it('2: moves one checker with both dice', () => {
    expect(offered('bothDice', startLesson(lesson('bothDice')))).toEqual(['13/10', '13/8']);
    const { flow, moves } = playThrough('bothDice');
    expect(moves).toHaveLength(2);
    expect(currentBoard(flow).points[4]?.white).toBe(5);
  });

  it('3: a double moves four times', () => {
    expect(playThrough('double').moves).toEqual(['13/10', '10/7', '7/4', '4/1']);
  });

  it('4: makes a point on 7 with two checkers', () => {
    expect(offered('makePoint', startLesson(lesson('makePoint')))).toEqual(['11/7', '9/7']);
    const { flow } = playThrough('makePoint');
    expect(currentBoard(flow).points[6]?.white).toBe(2);
  });

  it('5: hits the lone checker, which goes to the bar', () => {
    expect(offered('hit', startLesson(lesson('hit')))).toEqual(['13/9*']);
    const { flow } = playThrough('hit');
    expect(currentBoard(flow).bar.black).toBe(1);
  });

  it('6: enters from the bar; the blocked point is not offered', () => {
    expect(offered('enter', startLesson(lesson('enter')))).toEqual(['25/22']);
    const { flow } = playThrough('enter');
    expect(currentBoard(flow).bar.white).toBe(0);
  });

  it('7: bears off the last two checkers', () => {
    expect(offered('bearOff', startLesson(lesson('bearOff')))).toEqual(['4/0', '6/0']);
    const { flow } = playThrough('bearOff');
    expect(currentBoard(flow).off.white).toBe(15);
  });

  it('refuses a legal move the lesson does not teach', () => {
    const flow = startLesson(lesson('move'));
    expect(
      playLessonMove(lesson('move'), flow, { from: 6, to: 2, die: 4, capture: 'none' }),
    ).toBeNull();
  });
});

describe('Plakoto lessons (#149)', () => {
  it('1: pins the lone checker on 9; it stays on the board, under yours', () => {
    expect(offered('pin', startLesson(lesson('pin')))).toEqual(['13/9*']);
    const board = currentBoard(playThrough('pin').flow);
    expect(board.points[8]).toEqual({ white: 1, black: 1, pinned: 'black' });
    // No bar in Plakoto.
    expect(board.bar.black).toBe(0);
  });

  it('2: the pinned checker on 16 cannot move, not even for the engine', () => {
    const flow = startLesson(lesson('pinned'));
    expect(currentBoard(flow).points[15]?.pinned).toBe('white');
    expect(engineMoves(flow).some((m) => m.startsWith('16/'))).toBe(false);
    expect(offered('pinned', flow)).toEqual(['13/11', '13/8']);
    const { flow: end } = playThrough('pinned');
    expect(currentBoard(end).points[5]?.white).toBe(5);
    expect(currentBoard(end).points[15]?.pinned).toBe('white');
  });

  it('3: pins the mother on point 1; the mother question comes after the turn', () => {
    expect(offered('mother', startLesson(lesson('mother')))).toEqual(['5/1*']);
    const { flow } = playThrough('mother');
    expect(currentBoard(flow).points[0]).toEqual({ white: 1, black: 1, pinned: 'black' });
    // The rest of the roll could still be played: the lesson is done with the pin.
    expect(flow.phase).toBe('moving');
    expect(flow.state.rules.mother.motherRule).toBe('offerConcede');
  });

  it('4: bears off the last two checkers', () => {
    expect(offered('plakotoBearOff', startLesson(lesson('plakotoBearOff')))).toEqual([
      '3/0',
      '5/0',
    ]);
    expect(currentBoard(playThrough('plakotoBearOff').flow).off.white).toBe(15);
  });
});

describe('Fevga lessons (#149)', () => {
  it('1: starts in opposite corners; only one checker leaves 24', () => {
    const flow = startLesson(lesson('sameWay'));
    const board = currentBoard(flow);
    expect(board.points[23]?.white).toBe(15);
    expect(board.points[11]?.black).toBe(15);
    expect(offered('sameWay', flow)).toEqual(['24/19', '24/21']);
    const { flow: end, moves } = playThrough('sameWay');
    expect(moves).toEqual(['24/19', '19/16']);
    // The runner rule: the other checkers stayed on 24.
    expect(currentBoard(end).points[23]?.white).toBe(14);
  });

  it('2: a lone dark checker holds point 6, so the 4 is blocked', () => {
    const flow = startLesson(lesson('holdPoint'));
    expect(currentBoard(flow).points[5]).toEqual({ white: 0, black: 1, pinned: null });
    expect(engineMoves(flow)).not.toContain('10/6');
    expect(offered('holdPoint', flow)).toEqual(['10/7']);
    expect(playThrough('holdPoint').moves).toEqual(['10/7', '7/3']);
  });

  it('3: the runner must pass 12 before a checker leaves 24', () => {
    const flow = startLesson(lesson('runner'));
    // The engine itself allows only 13/11: 13/12 lands on Black, 24 is locked.
    expect(engineMoves(flow)).toEqual(['13/11']);
    const { flow: end, moves } = playThrough('runner');
    expect(moves).toEqual(['13/11', '24/23']);
    expect(currentBoard(end).points[22]?.white).toBe(1);
  });

  it('4: six in a row on 19 to 24 is banned, so only the 6 is played', () => {
    const flow = startLesson(lesson('sixInARow'));
    // The lesson filters nothing: the engine allows only 8/2.
    expect(engineMoves(flow)).toEqual(['8/2']);
    const { flow: end } = playThrough('sixInARow');
    expect(end.phase).toBe('awaiting-confirm');
    expect(currentBoard(end).points[18]?.white).toBe(0);
  });
});

describe('Asodio lessons (#159, owner version)', () => {
  it('plays in the owner preset: loading lock, quarter lock, pins', () => {
    const { rules } = startLesson(lesson('aceDeuce')).state;
    expect(rules.presetId).toBe('asodio.kafeneio');
    expect(rules.entry.firstEntryGate).toBe(true);
    expect(rules.entry.moveWhileLoading).toBe(false);
    expect(rules.quarters.quarterLock).toBe(true);
    expect(rules.capture.captureMode).toBe('pin');
  });

  it('1: all 15 wait off the board; the 1-2 enters on 24 and 23', () => {
    const flow = startLesson(lesson('aceDeuce'));
    const board = currentBoard(flow);
    expect(board.outside).toEqual({ white: 15, black: 15 });
    expect(board.points.every((p) => p.white === 0 && p.black === 0)).toBe(true);
    // The engine offers only entries: spot 1 is point 24, spot 2 is point 23.
    expect(offered('aceDeuce', flow)).toEqual(engineMoves(flow));
    expect(offered('aceDeuce', flow)).toEqual(['25/23', '25/24']);
    const end = currentBoard(playThrough('aceDeuce').flow);
    expect(end.points[23]?.white).toBe(1);
    expect(end.points[22]?.white).toBe(1);
    expect(end.outside.white).toBe(13);
  });

  it('2: the double 3-3 enters the last four on 22; entered checkers wait', () => {
    const flow = startLesson(lesson('enterAll'));
    // While a checker waits, no checker on the board may move (A2).
    expect(engineMoves(flow)).toEqual(['25/22']);
    const { flow: end, moves } = playThrough('enterAll');
    expect(moves).toEqual(['25/22', '25/22', '25/22', '25/22']);
    expect(currentBoard(end).points[21]?.white).toBe(4);
    expect(currentBoard(end).outside.white).toBe(0);
  });

  it('3: the last checker on 20 holds the front back; once it joins, the army moves', () => {
    const flow = startLesson(lesson('quarterLock'));
    const { rules } = flow.state;
    expect(frozenPoints(currentBoard(flow), 'white', rules)).toEqual([18, 17, 16, 15, 14]);
    // The engine itself allows only the last checker to move.
    expect(engineMoves(flow)).toEqual(['20/16', '20/17']);
    const first = playLessonMove(lesson('quarterLock'), flow, {
      from: 20,
      to: 16,
      die: 4,
      capture: 'none',
    })!;
    // All 15 are in 13 to 18: nothing is frozen, every checker may move.
    expect(frozenPoints(currentBoard(first), 'white', rules)).toEqual([]);
    expect(offered('quarterLock', first)).toEqual(['14/11', '15/12', '16/13', '17/14', '18/15']);
    expect(playThrough('quarterLock').flow.phase).toBe('awaiting-confirm');
  });

  it('4: pins the last dark checker on 10, and the whole dark army is frozen', () => {
    const flow = startLesson(lesson('pinLast'));
    const { rules } = flow.state;
    expect(frozenPoints(currentBoard(flow), 'black', rules)).toEqual([12, 11]);
    expect(offered('pinLast', flow)).toEqual(['16/10*']);
    const board = currentBoard(playThrough('pinLast').flow);
    expect(board.points[9]).toEqual({ white: 1, black: 1, pinned: 'black' });
    // No hitting: nothing goes to the bar.
    expect(board.bar.black).toBe(0);
    expect(armyFrozen(board, 'black', rules)).toBe(true);
  });
});
