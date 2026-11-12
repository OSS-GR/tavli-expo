import {
  BOARD_POINTS,
  dustPuffs,
  REST_FRAME,
  SCENE_TIMES as T,
  TABLE_SCENE_MS,
  tableFrame,
  type TableFrame,
} from './tableMotion';

const KEYS = Object.keys(REST_FRAME) as (keyof TableFrame)[];
/** The board's landing. */
const LAND = T.board + 300;

describe('tableFrame (#509, #512)', () => {
  it('starts empty: every part is off the grid', () => {
    const first = tableFrame(0);
    // The table's right edge (x 186) is left of the grid.
    expect(186 + first.tableX).toBeLessThan(0);
    // Their chair's left edge (x 98) is right of the grid (240 wide).
    expect(98 + first.theirX).toBeGreaterThan(240);
    expect(first.boardY).toBeLessThan(-100);
    // Your chair's top (y 82, grown from its feet at y 172) is below the grid (180 high).
    expect(172 + (82 - 172) * first.chairScale + first.chairY).toBeGreaterThan(180);
    expect(first.floor).toBe(0);
    expect(first.dust).toBe(0);
    expect(tableFrame(-50)).toEqual(first);
  });

  it('builds up in order: the table, their chair, the board, your chair', () => {
    expect(tableFrame(T.tableIn).tableX).toBeCloseTo(-200);
    expect(tableFrame(T.tableSettle).tableX).toBeCloseTo(0);
    expect(tableFrame(T.tableSettle).theirX).toBeCloseTo(150);
    expect(tableFrame(T.theirStop).theirX).toBeCloseTo(0);
    expect(tableFrame(T.theirStop).boardY).toBe(-115);
    expect(tableFrame(LAND).boardY).toBe(0);
    expect(tableFrame(T.yourRise).chairY).toBe(160);
    expect(tableFrame(T.yourIn).chairY).toBeCloseTo(24);
    expect(tableFrame(T.yourIn + 360).chairScale).toBeCloseTo(1);
  });

  it('skids the table in past its place, then settles it', () => {
    let most = -Infinity;
    for (let t = T.tableIn; t <= T.tableStop; t += 5) most = Math.max(most, tableFrame(t).tableX);
    expect(most).toBeGreaterThan(0);
    expect(tableFrame(T.tableIn + 50).tableRotate).toBeLessThan(0);
    expect(tableFrame((T.tableStop + T.tableSettle) / 2).tableRotate).toBeGreaterThan(0);
  });

  it('hops their chair as it comes in', () => {
    expect(tableFrame((T.theirIn + T.theirStop) / 2).theirY).toBeLessThan(-3);
    expect(tableFrame(T.theirStop).theirY).toBeCloseTo(0);
  });

  it('lands the board squashed, with dust and a dip of the table', () => {
    const land = tableFrame(LAND);
    expect(land.boardScaleX).toBeGreaterThan(1.1);
    expect(land.boardScaleY).toBeLessThan(0.7);
    expect(land.tableDip).toBe(2);
    expect(land.dust).toBeGreaterThan(0.8);
  });

  it('stretches the board while it falls', () => {
    const falling = tableFrame(LAND - 50);
    expect(falling.boardScaleY).toBeGreaterThan(1.2);
    expect(falling.boardScaleX).toBeLessThan(0.9);
    expect(falling.lines).toBeGreaterThan(0);
  });

  it('keeps your chair out of sight until the board has settled', () => {
    expect(tableFrame(LAND + 290).chairY).toBe(160);
    expect(tableFrame(T.yourRise).chairY).toBe(160);
  });

  it('never drops the board below the table', () => {
    for (let t = 0; t <= TABLE_SCENE_MS; t += 5)
      expect(tableFrame(t).boardY).toBeLessThanOrEqual(0);
  });

  it('moves smoothly: no jump between 1 ms steps', () => {
    for (let t = 0; t < TABLE_SCENE_MS; t += 1) {
      const a = tableFrame(t);
      const b = tableFrame(t + 1);
      for (const key of KEYS) expect(Math.abs(b[key] - a[key])).toBeLessThan(2.5);
    }
  });

  it('rests on the last frame from the end on', () => {
    expect(tableFrame(TABLE_SCENE_MS)).toEqual(REST_FRAME);
    expect(tableFrame(TABLE_SCENE_MS * 3)).toEqual(REST_FRAME);
    const almost = tableFrame(TABLE_SCENE_MS - 1);
    for (const key of KEYS) expect(Math.abs(almost[key] - REST_FRAME[key])).toBeLessThan(0.05);
  });
});

describe('the drawing', () => {
  it('draws 22 points on the board, 11 of each colour, with a bar in the middle', () => {
    expect(BOARD_POINTS.light.match(/M/g)).toHaveLength(11);
    expect(BOARD_POINTS.dark.match(/M/g)).toHaveLength(11);
  });

  it('spreads the dust out from the landing', () => {
    const near = dustPuffs(0);
    const far = dustPuffs(10);
    expect(far[0]!.x).toBeLessThan(near[0]!.x);
    expect(far[2]!.x).toBeGreaterThan(near[2]!.x);
  });
});
