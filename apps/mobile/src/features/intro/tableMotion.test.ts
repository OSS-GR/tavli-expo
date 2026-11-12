import {
  BOARD_POINTS,
  dustPuffs,
  REST_FRAME,
  TABLE_SCENE_MS,
  tableFrame,
  type TableFrame,
} from './tableMotion';

const KEYS = Object.keys(REST_FRAME) as (keyof TableFrame)[];

describe('tableFrame (#509)', () => {
  it('starts with the board out of sight above and your chair pulled out', () => {
    const first = tableFrame(0);
    expect(first.boardY).toBeLessThan(-100);
    expect(first.chairScale).toBeGreaterThan(1.2);
    expect(first.chairY).toBeGreaterThan(0);
    expect(first.dust).toBe(0);
    expect(tableFrame(-50)).toEqual(first);
  });

  it('lands squashed at 300 ms, with dust and a dip of the table', () => {
    const land = tableFrame(300);
    expect(land.boardY).toBe(0);
    expect(land.boardScaleX).toBeGreaterThan(1.1);
    expect(land.boardScaleY).toBeLessThan(0.7);
    expect(land.tableDip).toBe(2);
    expect(land.dust).toBeGreaterThan(0.8);
  });

  it('stretches the board while it falls', () => {
    const falling = tableFrame(250);
    expect(falling.boardScaleY).toBeGreaterThan(1.2);
    expect(falling.boardScaleX).toBeLessThan(0.9);
    expect(falling.lines).toBeGreaterThan(0);
  });

  it('keeps your chair out until the board has settled, then pulls it in', () => {
    expect(tableFrame(600).chairScale).toBe(tableFrame(0).chairScale);
    expect(tableFrame(800).chairScale).toBeLessThan(tableFrame(640).chairScale);
    expect(tableFrame(1000).chairScale).toBeCloseTo(1);
  });

  it('never drops the board below the table', () => {
    for (let t = 0; t <= TABLE_SCENE_MS; t += 5)
      expect(tableFrame(t).boardY).toBeLessThanOrEqual(0);
  });

  it('moves smoothly after the landing: no jump between 5 ms steps', () => {
    // The landing itself is a cut (the cartoon squash); after it, small steps only.
    for (let t = 305; t < TABLE_SCENE_MS; t += 5) {
      const a = tableFrame(t);
      const b = tableFrame(t + 5);
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
