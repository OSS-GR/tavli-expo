import { currentBoard, formatMove, getPreset, type GameFlow } from '@tavli/engine';

import { LESSONS, lessonMoves, playLessonMove, startLesson, type LessonId } from './lessons';

const lesson = (id: LessonId) => {
  const found = LESSONS.find((l) => l.id === id);
  if (!found) throw new Error(id);
  return found;
};

/** What the board offers now, as notation (`13/9`). */
const offered = (id: LessonId, flow: GameFlow) =>
  lessonMoves(lesson(id), flow)
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

  it.each(LESSONS.map((l) => l.id))('%s starts in Portes, White to move, fixed dice', (id) => {
    const flow = startLesson(lesson(id));
    expect(flow.state.variant).toBe('portes');
    expect(flow.state.rules).toEqual(getPreset('portes'));
    expect(flow.phase).toBe('moving');
    expect(flow.state.toMove).toBe('white');
    expect(flow.state.dice).toEqual(lesson(id).dice);
    // The same start every time: no RNG.
    expect(startLesson(lesson(id))).toEqual(flow);
    expect(lessonMoves(lesson(id), flow).length).toBeGreaterThan(0);
  });

  it.each(LESSONS.map((l) => l.id))('%s can be finished with the moves it offers', (id) => {
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
